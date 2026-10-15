#!/usr/bin/env bash
# Corre dentro del emulador de Android en GitHub Actions (ver .github/workflows/android.yml).
set -uo pipefail
mkdir -p capturas-android
adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell input keyevent 82 || true   # desbloquear pantalla
adb shell dumpsys webviewupdate | grep -iE "current webview package|version" | head -3 || true
adb install -r -t android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c || true
SHOTS=capturas-android node android/test/apk-e2e.mjs
estado=$?
adb logcat -d -v time > capturas-android/logcat.txt 2>/dev/null || true
grep -iE "chromium|rinconcito|AndroidRuntime" capturas-android/logcat.txt | tail -60 || true
exit $estado
