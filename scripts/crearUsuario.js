require('dotenv').config();
const { sequelize, Usuario } = require('../src/models');

async function crearUsuario() {
  const args = process.argv.slice(2);
  const correo = args[0] || 'admin@seguraep.gob.ec';
  const password = args[1] || 'Admin123*';
  const nombre = args[2] || 'Administrador Inicial';
  const rol = args[3] || 'admin';

  try {
    await sequelize.authenticate();
    console.log('Conexión con la base de datos establecida.');

    const correoNormalizado = correo.toLowerCase().trim();
    const esDominioValido = correoNormalizado.endsWith('@seguraep.gob.ec') || correoNormalizado.endsWith('@mail.seguraep.gob.ec');
    
    if (!esDominioValido) {
      console.error('❌ Error: El correo institucional debe pertenecer al dominio @seguraep.gob.ec o @mail.seguraep.gob.ec');
      process.exit(1);
    }

    const usuarioExiste = await Usuario.findOne({ where: { correo: correoNormalizado } });
    if (usuarioExiste) {
      console.log(`⚠️ El usuario ${correoNormalizado} ya existe (ID: ${usuarioExiste.id}, Rol: ${usuarioExiste.rol}).`);
      process.exit(0);
    }

    const nuevoUsuario = await Usuario.create({
      correo: correoNormalizado,
      password,
      nombre,
      rol,
      requiere_cambio_pw: false
    });

    console.log('=============================================');
    console.log('✅ Usuario creado exitosamente:');
    console.log(`   ID:     ${nuevoUsuario.id}`);
    console.log(`   Nombre: ${nuevoUsuario.nombre}`);
    console.log(`   Correo: ${nuevoUsuario.correo}`);
    console.log(`   Rol:    ${nuevoUsuario.rol}`);
    console.log('=============================================');
  } catch (error) {
    console.error('❌ Error al crear usuario:', error.message);
  } finally {
    await sequelize.close();
  }
}

crearUsuario();
