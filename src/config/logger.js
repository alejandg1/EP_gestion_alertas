const winston = require('winston');
const path = require('path');
const Sentry = require('@sentry/node');
const Transport = require('winston-transport');

class SentryWinstonTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.level = 'error';
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    if (process.env.BUGSINK_DSN) {
      if (info instanceof Error) {
        Sentry.captureException(info);
      } else if (info.stack) {
        const err = new Error(info.message);
        err.stack = info.stack;
        Sentry.captureException(err, { extra: info });
      } else {
        Sentry.captureMessage(typeof info.message === 'string' ? info.message : JSON.stringify(info), 'error');
      }
    }
    callback();
  }
}

const logFormat = winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
  if (Object.keys(meta).length > 0) {
    log += ` | meta: ${JSON.stringify(meta)}`;
  }
  return log;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'sala-situacional-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      )
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    new SentryWinstonTransport()
  ]
});

module.exports = logger;
