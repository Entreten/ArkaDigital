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
- Solo cambios manuales de contraseña. Por cuenta se pide correo actual, contraseña actual y contraseña nueva deseada; cada cuenta puede solicitar una distinta. Nunca se cambia el correo ni se generan nombres, dominios o contraseñas aleatorias.
- Las cuentas de clientes nunca entran al inventario. No hay entregas parciales ni doble pago al corregir; se acredita al confirmar la entrega completa.
- El trabajador tiene «✓ Cambio realizado» y «Reportar problema». El visto confirma la ejecución externa y envía a revisión administrativa. Ante un problema, el mayorista elige reemplazar la cuenta o recuperar automáticamente su importe en saldo interno una sola vez, sin devolución bancaria ni pago al ejecutor por esa unidad.
- Comisión del 3% únicamente sobre producción mensual de trabajadores, con cálculo acumulado por asignación. Incluye ajuste histórico autorizado; si falta saldo disponible se deja pendiente sin generar deudas.
- El administrador puede producir o realizar cambios personalmente. Su margen comercial, ejecución propia, comisiones, reserva y retiros tienen movimientos separados.
- La reserva empieza sin porcentaje configurado. Se requiere una elección explícita; no se inventan costes históricos ausentes.
- Datos de cambios: acceso del comprador durante siete días exactos desde la entrega completa, exportación XLSX y limpieza posterior. El equipo deja de acceder al entregar.
- Al abrir un pedido de cambios entregado, su mayorista ve juntos los correos y contraseñas finales, con copia individual o en lote. La consulta y la exportación leen por lotes, sin revelar contraseñas originales ni datos de unidades canceladas.
- Los servicios nuevos de cambios solo aceptan cuentas ingresadas manualmente. No hay selector ni vinculación automática con compras anteriores.
- `database/services.sql` es aditivo y transaccional. El flujo de despliegue permite `validate`, `migrate` y `deploy`; las pruebas usan PostgreSQL aislado y navegador con datos ficticios.
- No se modifica el mecanismo externo que mantiene activo Render, ni los recursos de audio o temas existentes.
- La aprobación de la última unidad completa automáticamente el servicio y acredita una sola vez las ganancias. La oferta no selecciona ni restringe personas: después de verificar el pago, el administrador elige trabajadores activos y cantidades en el pedido.
- Al asignar producción, repartir o reasignar servicios, el administrador fija fecha y hora máximas. Puede fijarlas también en reportes y trabajos anteriores pendientes. Los trabajos antiguos no reciben fechas inventadas.
- Los contadores usan hora del servidor y muestran el atraso; no borran trabajos, bloquean envíos tardíos ni cancelan pagos. La producción deja de descontar tiempo al enviarse completa a revisión, vuelve a contar si se rechaza; cada unidad de servicio se detiene al enviarse a revisión y cada reporte al resolverse.
- `database/password-deadlines.sql` conserva precios, salarios y entregas completadas; corrige solo ofertas y pedidos activos a contraseña. Las solicitudes antiguas ya enviadas bajo otra modalidad se devuelven a revisión para evitar aprobar cambios de correo.
- Las compras entregadas muestran todas las credenciales del producto juntas, con copia por campo, cuenta y lote filtrado.
- Los avisos privados cubren pedidos, pagos, asignaciones, producción, garantías y derivaciones. El sonido requiere activación del usuario; se conserva el canal en pestañas en segundo plano.
- Los avisos de tareas se retiran del buzón al terminar la fase pendiente de cada responsable, sin borrar la trazabilidad. Las confirmaciones informativas de entrega y saldo se retiran al leerlas. El buzón abierto se actualiza con los eventos existentes.
- El administrador puede editar trabajos y quitar asignaciones erróneas. No se eliminan asignaciones de producción que ya tengan cuentas o pagos; en servicios solo se liberan unidades pendientes de envío, sin borrar compras ni devolver dinero.
- «Mis cuentas compradas» permite buscar un correo completo entre todos los pedidos propios, muestra producto, pedido y fecha, y abre la compra filtrada. La consulta usa una huella indexada y no descarga contraseñas de otras carpetas.
- `readability.css` aumenta ligeramente la letra; no cambia temas, audio, reglas de negocio ni escala el diseño completo.
- En Trabajadores → Editar → Corregir saldo, solo el administrador fija el nuevo saldo total con motivo y confirmación. Se protege el dinero reservado, se impiden saldos negativos, sobrescrituras concurrentes y duplicados; cada diferencia queda en el historial del trabajador y como ajuste separado de la cuenta administrativa, sin alterar producción ni comisiones.
- El administrador puede retirar una venta de prueba con confirmación y copia privada de recuperación. No se revierten silenciosamente pagos laborales ni se devuelven cuentas usadas al stock.

La instalación no trae cuentas streaming ni ventas ficticias. El administrador debe registrar productos, bancos, usuarios y stock.
