# ARKA DIGITAL
Plataforma privada para administrador, mayoristas y trabajadores. Código en GitHub, servicio Node.js en Render y almacenamiento PostgreSQL en Supabase.

## Operación
- Acceso por correo/contraseña. Registro y roles controlados por administrador; no hay registro público.
- Productos con identificador estable, descripción, condiciones, precios y modalidad de duración o dominio.
- Producción asignada, revisión individual y crédito automático por cuenta aprobada. Garantías sin pago adicional.
- Stock transaccional, reservas de 24 horas para pedidos no declarados, transferencia manual y entrega solo tras aprobación.
- Historial por pedido/producto, reportes al trabajador y trazabilidad de cambios.
- Retiros mínimos de USD 10 con reserva de saldo y confirmación manual.
- Temas original, Navidad y Amor y amistad; anuncio en globo aerostático y movimiento reducido accesible.

## Seguridad
Credenciales de productos cifradas con AES-256-GCM en el servidor; contraseñas de usuarios protegidas con scrypt y sal aleatoria. La clave de cifrado se conserva al redesplegar. No modificar ni perder ENCRYPTION_KEY si existen cuentas cargadas. Sesiones HttpOnly, Secure en producción, SameSite y control de origen. RLS sin acceso directo anónimo. Las operaciones de dinero y stock usan transacciones SQL y bloqueos.

No subir claves, contraseñas ni datos de cuentas al repositorio. Configuración privada únicamente en GitHub Actions Secrets y variables de entorno privadas de Render.

## Criterios conservadores aplicados
Garantía de productos por duración hasta el vencimiento completo (no se rechaza automáticamente al 90/95%). Para dominio: hasta 72 horas o confirmación individual de funcionamiento y cambio de correo, lo que ocurra primero. Datos de dominio se eliminan a los 7 días; datos de duración a los 7 días después de vencer. Reportes abiertos bloquean la limpieza. Registros financieros y trazabilidad sin credenciales se conservan. Reemplazos no reinician la vigencia ni generan pagos adicionales.

## Despliegue
Ejecutar el workflow Construir y desplegar ARKA DIGITAL. Usa RENDER_API_KEY, SUPABASE_ACCESS_TOKEN y ADMIN_PASSWORD_HASH; el acceso inicial no está en el código. Solo crea servicios Render free; no contrata recursos de pago. Puede requerir permisos de escritura de los tokens. Las migraciones son idempotentes y no sustituyen datos existentes.

Comandos: npm install; npm test; npm run check; npm start.

La instalación no trae cuentas streaming ni ventas ficticias. El administrador debe registrar productos, bancos, usuarios y stock.
