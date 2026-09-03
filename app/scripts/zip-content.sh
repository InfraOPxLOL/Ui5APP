#!/bin/sh
# Zips the built UI5 app's output (dist/) into a single archive with manifest.json
# at the archive's own root — the structure the HTML5 Application Repository requires
# per app. Invoked as a plain script because MBT's custom builder execs each command
# directly (no shell), so inline "cd x && y" syntax is not usable in mta.yaml itself.
set -e
cd dist
zip -rq app-content.zip . -x 'app-content.zip'
