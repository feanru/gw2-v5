# Verificación de integridad y acceso a *source maps*

El proceso de *build* genera hashes SRI (`sha256` y `sha384`) para los
recursos JavaScript y CSS. Los valores se anexan automáticamente en los
atributos `integrity` de las etiquetas `<script>` y `<link>`, junto con
`crossorigin="anonymous"`. Los navegadores verifican estos hashes antes de
ejecutar o aplicar los archivos, garantizando que no fueron alterados.

Para comprobar manualmente la integridad de un archivo se puede ejecutar:

```bash
openssl dgst -sha256 -binary archivo | openssl base64 -A
```

## *Source maps*

Se generan *source maps* por cada `build` con el nombre `*.v<version>.js.map`.
El destino se controla con la variable de entorno `SOURCE_MAP_TARGET`:

- `cdn` (por defecto): los mapas permanecen junto a los bundles y pueden
  subirse a la CDN.
- `internal`: los mapas se mueven a `dist/<version>/sourcemaps/` para alojarlos
  en un servidor interno.

Los bundles apuntan automáticamente al nombre y ubicación correctos mediante
`//# sourceMappingURL=...`. Para depurar basta con acceder al mapa generado
de la versión correspondiente.
