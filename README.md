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

## Servicios de cambios y finanzas
- Secciones independientes para ofertas, pedidos CAM, ejecución del administrador y revisión. Solo el administrador decide los repartos y reasignaciones.
- Cambios manuales de correo, contraseña o ambos: instrucciones por pedido y unidad, sugerencias aleatorias, validación de la contraseña común y aceptación de tarifa.
- Las cuentas de clientes nunca entran al inventario. No hay entregas parciales ni doble pago al corregir; se acredita al confirmar la entrega completa.
- Incidencias por unidad, sustituciones y devoluciones autorizadas al saldo del mayorista. El saldo se utiliza tanto en stock como en nuevos cambios.
- Comisión del 3% únicamente sobre producción mensual de trabajadores, con cálculo acumulado por asignación. Incluye ajuste histórico autorizado; si falta saldo disponible se deja pendiente sin generar deudas.
- El administrador puede producir o realizar cambios personalmente. Su margen comercial, ejecución propia, comisiones, reserva y retiros tienen movimientos separados.
- La reserva empieza sin porcentaje configurado. Se requiere una elección explícita; no se inventan costes históricos ausentes.
- Datos de cambios: acceso del comprador durante siete días exactos desde la entrega completa, exportación XLSX y limpieza posterior. El equipo deja de acceder al entregar.
- Los servicios nuevos de cambios solo aceptan cuentas ingresadas manualmente. No hay selector ni vinculación automática con compras anteriores.
- `database/services.sql` es aditivo y transaccional. El flujo de despliegue permite `validate`, `migrate` y `deploy`; las pruebas usan PostgreSQL aislado y navegador con datos ficticios.
- No se modifica el mecanismo externo que mantiene activo Render, ni los recursos de audio o temas existentes.
- La aprobación de la última unidad completa automáticamente el servicio y acredita una sola vez las ganancias. Sin restricciones explícitas en la oferta, el administrador puede asignar a cualquier trabajador activo.
- Las compras entregadas muestran todas las credenciales del producto juntas, con copia por campo, cuenta y lote filtrado.
- Los avisos privados cubren pedidos, pagos, asignaciones, producción, garantías y derivaciones. El sonido requiere activación del usuario; se conserva el canal en pestañas en segundo plano.
- El administrador puede retirar una venta de prueba con confirmación y copia privada de recuperación. No se revierten silenciosamente pagos laborales ni se devuelven cuentas usadas al stock.

La instalación no trae cuentas streaming ni ventas ficticias. El administrador debe registrar productos, bancos, usuarios y stock.
