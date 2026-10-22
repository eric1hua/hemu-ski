#!/bin/zsh
# Double-click launcher for the map editor: the same dev server as
# Hemu Ski.command (port 5190, started if it isn't running), opened at the
# editor. Close the window it started the server in to stop it.
export HEMU_PAGE=tools/map-editor/
exec "${0:A:h}/Hemu Ski.command"
