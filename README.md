# Seguimiento de clientes · Hyenas

Aplicación estática para GitHub Pages con backend online en Supabase. La página principal solicita una clave privada de administrador; los vendedores ingresan con su enlace único. Las claves no se incluyen en este repositorio.

## Uso

1. Publicar `main`, carpeta raíz, desde Settings → Pages del repositorio.
2. Abrir el enlace privado del administrador entregado por separado.
3. En **Vendedores y enlaces**, usar los cuatro vendedores iniciales o agregar uno nuevo.
4. En **Importar Excel**, elegir vendedor y archivo `.xlsx`, `.xls` o `.csv`. Elegir hoja, fila de encabezados y columnas. Revisar el resumen y confirmar.
5. Generar el enlace del vendedor, copiarlo y enviarlo. Regenerarlo revoca el anterior.
6. Cada vendedor cambia estado o notas y pulsa **Guardar marcación**. El administrador pulsa **Actualizar datos** para consultar los cambios.
7. Combinar vendedores, estados, búsqueda, rango de última venta o clientes compartidos. Exportar todos los filtrados o solo las fichas marcadas dentro del filtro actual.

## Importación

Una fila consolidada por cliente, importes acumulados en USD. Reconoce el Excel original de Angi, incluso con títulos y resúmenes arriba del encabezado. Para otros formatos se asignan las columnas manualmente. No suma importaciones: reemplaza los importes de cada coincidencia para evitar duplicar ventas. Conserva estado, notas e historial. No borra clientes ausentes. Rechaza duplicados dentro del archivo, fechas inválidas, importes negativos y más de 5000 filas. Límite de archivo: 10 MB.

La identidad se basa en la URL de perfil normalizada (sin `www`, parámetros o barra final); cuando no hay URL usa red social y usuario. Para que coincidan distintas importaciones, mantener el mismo enlace. El indicador de clientes compartidos significa coincidencia de identidad, no que las dos personas hayan sido verificadas manualmente.

## Arquitectura y seguridad

- `index.html`, `style.css`, `app.js`, `core.js`: interfaz responsive sin compilación.
- SheetJS CE 0.20.3 se carga desde su CDN oficial con integridad SHA-384.
- `supabase/functions/client-tracker/index.ts`: API con autenticación propia; verifica en cada petición claves aleatorias de 256 bits, almacenadas solo como hashes SHA-256.
- `schema.sql`: esquema inicial ya aplicado al proyecto. No volver a ejecutarlo sobre la base existente.
- Todas las tablas `ct_*` tienen RLS y acceso directo revocado para `anon` y `authenticated`. Solo la función de servidor accede con `service_role`, tomada de su entorno y nunca enviada al navegador.
- Los enlaces son credenciales: quien posee uno puede consultar y marcar la cartera de ese vendedor. El enlace del administrador permite administrar todo. No publicarlos en el repositorio.
- Las claves se guardan en la sesión del navegador y se retiran del fragmento visible después de ingresar. **Salir** borra la sesión. Para revocar un vendedor, regenerar su enlace.
- Versionado optimista de marcaciones: si otra sesión ya cambió la ficha, rechaza la actualización antigua. Historial en `ct_history`; importaciones en `ct_imports`.
- GitHub Pages no guarda los datos: no subir nuevos Excel ni claves al repositorio. El primer HTML histórico publicado contenía datos de Angi y sigue presente en el historial Git.

## Backend instalado

Proyecto Supabase: `jgjvzqfxakvogaeqfual`. Función: `client-tracker`.
La función usa `verify_jwt=false` porque implementa autenticación propia de claves; nunca desactivar sus comprobaciones de rol y vendedor.

Los clientes de Angi del archivo original están cargados online. Esteban Basaure, Carlos da Silva y Joa están creados, sin clientes hasta importar sus archivos. Las antiguas marcaciones locales no estaban en el Excel y no se migran automáticamente.

## Verificación

`node --check app.js` y `node --check core.js`. Las pruebas de integración realizadas cubren acceso sin clave, aislamiento de vendedores, rechazo de escrituras sobre otro vendedor, conservación de notas al reimportar y conflicto de marcaciones.
