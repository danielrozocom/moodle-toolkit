# Moodle Toolkit

Herramientas inteligentes y adaptativas para Moodle (Virtual) y BanWeb (Tierra), distribuidas como un userscript de Tampermonkey.

**Autor:** Daniel Josue Rozo Vargas — [www.danielrozo.com](https://www.danielrozo.com)

## Características

- **Calificador masivo inteligente** — marca respuestas en encuestas/feedback de Moodle y BanWeb con la nota seleccionada (1 a 5).
- **Automatizador de tiempo / anti-inactividad** — detecta el tiempo mínimo requerido, mantiene la sesión activa y cuenta regresiva en pantalla.
- **Completar SCORM** — fuerza el estado `completed`/`passed` y puntuación 100 en la API SCORM detectada (SCORM 1.2 y 2004).
- **Auto-avance estricto para lecciones** — avanza automáticamente por las páginas de una lección de Moodle (`/mod/lesson`).
- **Panel adaptativo** — solo muestra las acciones relevantes según el contenido de la página, con estética shadcn/ui.

## Instalación

1. Instala la extensión [Tampermonkey](https://www.tampermonkey.net/) en tu navegador.
2. Haz clic en uno de los botones para instalar o actualizar:

   [![Instalar en Tampermonkey](https://img.shields.io/badge/Instalar_en_Tampermonkey-Moodle_Toolkit-00485B?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/danielrozocom/moodle-toolkit/main/moodle-toolkit.user.js)
   [![Actualizar ahora](https://img.shields.io/badge/Actualizar_ahora-Moodle_Toolkit-1e293b?style=for-the-badge&logo=github)](https://raw.githubusercontent.com/danielrozocom/moodle-toolkit/main/moodle-toolkit.user.js)

   o abre el enlace directo: 👉 [Instalar Moodle Toolkit](https://raw.githubusercontent.com/danielrozocom/moodle-toolkit/main/moodle-toolkit.user.js)

3. El script se activa automáticamente en `https://virtual.unipiloto.edu.co/*` y `https://tierra.unipiloto.edu.co/*`.

## Actualizaciones automáticas

El script incluye `@updateURL` y `@downloadURL` apuntando a este repositorio, por lo que Tampermonkey detectará y aplicará nuevas versiones automáticamente (configurable en el panel de Tampermonkey → "Comprobar actualizaciones").

## Arquitectura

El código está organizado en módulos con responsabilidad única (principios SOLID):

- `GraderModule` — calificación masiva.
- `TimerModule` — temporizador y keep-alive.
- `ScormModule` — detección y completado de API SCORM.
- `AutoAdvanceModule` — auto-avance persistente de lecciones.
- `PageDetector` — detección del tipo de página.
- `UiModule` — renderizado y enlace de eventos del panel.

La UI consume los módulos a través de un contrato mínimo (métodos `execute`/`start`/`complete`/etc.), sin conocer su implementación interna.

## Licencia

MIT — Daniel Josue Rozo Vargas.