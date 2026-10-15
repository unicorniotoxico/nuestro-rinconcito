#!/usr/bin/env bash
# Corre dentro del emulador de Android en GitHub Actions (ver .github/workflows/android.yml).
set -uo pipefail
mkdir -p capturas-android
exec > >(tee capturas-android/salida.txt) 2>&1
echo "Emulador: $(adb shell getprop ro.build.version.release 2>/dev/null) / API $(adb shell getprop ro.build.version.sdk 2>/dev/null)"
adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell input keyevent 82 || true   # desbloquear pantalla
# que el emulador no tape la pantalla con avisos del sistema (no afecta a la app)
adb shell settings put secure immersive_mode_confirmations confirmed || true
adb shell settings put global hide_error_dialogs 1 || true
adb shell settings put secure anr_show_background 0 || true
sleep 15
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1 || true
adb shell dumpsys webviewupdate | grep -iE "current webview package|version" | head -3 || true
adb install -r -t android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c || true
SHOTS=capturas-android node android/test/apk-e2e.mjs
estado=$?
adb logcat -d -v time > capturas-android/logcat.txt 2>/dev/null || true
grep -iE "chromium|rinconcito|AndroidRuntime" capturas-android/logcat.txt | tail -60 || true
exit $estado
