package io.github.unicorniotoxico.rinconcito;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * "Nuestro rinconcito" para Android.
 *
 * El juego vive en el servidor (multijugador real), así que la app es una ventana
 * dedicada a él: pantalla completa, sin barra del navegador, que recuerda la dirección
 * del servidor, espera a que "despierte" (Render gratis se duerme) y comparte
 * invitaciones con las apps del teléfono.
 *
 * Las páginas le hablan a la app con el objeto JavaScript "RinconcitoApp" (ver Puente)
 * o, como alternativa, con enlaces rinconcito://...:
 *   guardar?servidor=URL[&abrir=URL]   guarda la dirección y abre la isla
 *   config                              pantalla para cambiar el servidor
 *   inicio                              pantalla de "conectando"
 *   compartir?texto=...                 abre el menú de compartir de Android
 *   minimizar                           manda la app al fondo
 */
public class MainActivity extends Activity {
    private static final String PREFS = "rinconcito";
    private static final String ASSET = "file:///android_asset/app.html";

    private WebView web;
    private FrameLayout raiz;
    private String servidor = "";

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        raiz = new FrameLayout(this);
        raiz.setBackgroundColor(0xFF2F2632);
        web = new WebView(this);
        web.setBackgroundColor(0xFFF8C6B5);
        raiz.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(raiz);
        pantallaCompleta();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // localStorage: ahí vive la llave personal
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);                     // el juego ya usa textos grandes
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);            // los assets propios igual cargan
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " RinconcitoApp/" + BuildConfig.VERSION_NAME);
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Cliente());
        web.addJavascriptInterface(new Puente(), "RinconcitoApp");

        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        servidor = p.getString("servidor", BuildConfig.SERVIDOR_POR_DEFECTO);
        if (servidor == null) servidor = "";

        if (servidor.isEmpty()) mostrarConfig(null);
        else mostrarInicio(null, null);
    }

    // ------------------------------------------------------------------ pantallas locales
    private void mostrarInicio(String abrir, String error) {
        StringBuilder u = new StringBuilder(ASSET).append("#modo=inicio&servidor=").append(Uri.encode(servidor))
                .append("&version=").append(Uri.encode(BuildConfig.VERSION_NAME));
        if (abrir != null) u.append("&abrir=").append(Uri.encode(abrir));
        if (error != null) u.append("&error=").append(Uri.encode(error));
        web.loadUrl(u.toString());
    }

    private void mostrarConfig(String error) {
        StringBuilder u = new StringBuilder(ASSET).append("#modo=config&servidor=").append(Uri.encode(servidor))
                .append("&version=").append(Uri.encode(BuildConfig.VERSION_NAME));
        if (error != null) u.append("&error=").append(Uri.encode(error));
        web.loadUrl(u.toString());
    }

    /** Solo esquema + host + puerto, en minúsculas. Devuelve null si no es http(s). */
    private static String origen(String url) {
        if (url == null) return null;
        Uri u = Uri.parse(url.trim());
        String esquema = u.getScheme();
        String host = u.getHost();
        if (esquema == null || host == null || host.isEmpty()) return null;
        esquema = esquema.toLowerCase();
        if (!esquema.equals("http") && !esquema.equals("https")) return null;
        int puerto = u.getPort();
        return esquema + "://" + host.toLowerCase() + (puerto > 0 ? ":" + puerto : "");
    }

    private boolean esDelServidor(Uri u) {
        String o = origen(u.toString());
        return o != null && !servidor.isEmpty() && o.equals(servidor);
    }

    private void comando(Uri u) {
        String accion = u.getHost() == null ? "" : u.getHost();
        switch (accion) {
            case "guardar": {
                String nuevo = origen(u.getQueryParameter("servidor"));
                if (nuevo == null) { mostrarConfig("Esa dirección no parece válida"); return; }
                servidor = nuevo;
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("servidor", servidor).apply();
                String abrir = u.getQueryParameter("abrir");
                mostrarInicio(abrir != null && nuevo.equals(origen(abrir)) ? abrir : null, null);
                break;
            }
            case "config":
                mostrarConfig(null);
                break;
            case "inicio":
                if (servidor.isEmpty()) mostrarConfig(null); else mostrarInicio(null, null);
                break;
            case "compartir": {
                String texto = u.getQueryParameter("texto");
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, texto == null ? "" : texto);
                try { startActivity(Intent.createChooser(i, getString(R.string.compartir))); } catch (ActivityNotFoundException ignored) { }
                break;
            }
            case "minimizar":
                moveTaskToBack(true);
                break;
            default:
                break;
        }
    }

    /**
     * Lo que pueden pedirle a la app las páginas que muestra (solo el juego y la
     * pantalla de inicio: cualquier otra dirección se abre en el navegador).
     * Nada de esto da acceso a datos del teléfono.
     */
    private class Puente {
        private void ui(Runnable r) { runOnUiThread(r); }
        @JavascriptInterface public void compartir(String texto) {
            ui(() -> comando(Uri.parse("rinconcito://compartir?texto=" + Uri.encode(texto == null ? "" : texto))));
        }
        @JavascriptInterface public void config() { ui(() -> comando(Uri.parse("rinconcito://config"))); }
        @JavascriptInterface public void inicio() { ui(() -> comando(Uri.parse("rinconcito://inicio"))); }
        @JavascriptInterface public void minimizar() { ui(() -> moveTaskToBack(true)); }
        @JavascriptInterface public void guardar(String servidor, String abrir) {
            String u = "rinconcito://guardar?servidor=" + Uri.encode(servidor == null ? "" : servidor)
                    + (abrir != null && !abrir.isEmpty() ? "&abrir=" + Uri.encode(abrir) : "");
            ui(() -> comando(Uri.parse(u)));
        }
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
    }

    private void abrirAfuera(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
    }

    private class Cliente extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            String esquema = u.getScheme() == null ? "" : u.getScheme();
            if (esquema.equals("rinconcito")) { comando(u); return true; }
            if (u.toString().startsWith("file:///android_asset/")) return false;
            if (esDelServidor(u)) return false;
            if (esquema.equals("http") || esquema.equals("https") || esquema.equals("mailto") || esquema.equals("tel") || esquema.equals("whatsapp") || esquema.equals("intent")) {
                abrirAfuera(u);
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
            if (!req.isForMainFrame() || !esDelServidor(req.getUrl())) return;
            mostrarInicio(req.getUrl().toString(), "No pude abrir la isla (" + err.getDescription() + ")");
        }

        @Override
        public void onReceivedHttpError(WebView v, WebResourceRequest req, WebResourceResponse res) {
            if (!req.isForMainFrame() || !esDelServidor(req.getUrl())) return;
            if (res.getStatusCode() >= 500) mostrarInicio(req.getUrl().toString(), "El servidor respondió con un error (" + res.getStatusCode() + "). Probá de nuevo en un ratito.");
        }
    }

    // ------------------------------------------------------------------ botón atrás
    @Override
    public void onBackPressed() {
        String url = web.getUrl();
        if (url == null) { moveTaskToBack(true); return; }
        if (url.startsWith(ASSET)) {
            if (url.contains("modo=config") && !servidor.isEmpty()) mostrarInicio(null, null);
            else moveTaskToBack(true);
            return;
        }
        // dentro del juego: primero cierra menús y ventanas; si no había nada abierto, minimiza
        web.evaluateJavascript("(window.__rinconcitoBack && window.__rinconcitoBack()) ? 1 : 0", r -> {
            if (!"1".equals(r)) moveTaskToBack(true);
        });
    }

    // ------------------------------------------------------------------ pantalla completa
    private void pantallaCompleta() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
            // Deja lugar para el recorte de la cámara y para el teclado
            raiz.setOnApplyWindowInsetsListener((vista, insets) -> {
                Insets corte = insets.getInsets(WindowInsets.Type.displayCutout());
                Insets teclado = insets.getInsets(WindowInsets.Type.ime());
                vista.setPadding(corte.left, corte.top, corte.right, Math.max(corte.bottom, teclado.bottom));
                return insets;
            });
        } else if (Build.VERSION.SDK_INT >= 28) {
            raiz.setOnApplyWindowInsetsListener((vista, insets) -> {
                DisplayCutout dc = insets.getDisplayCutout();
                if (dc != null) vista.setPadding(dc.getSafeInsetLeft(), 0, dc.getSafeInsetRight(), 0);
                return insets;
            });
        }
    }

    @Override
    public void onWindowFocusChanged(boolean foco) {
        super.onWindowFocusChanged(foco);
        if (foco && Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) c.hide(WindowInsets.Type.systemBars());
        }
    }

    // ------------------------------------------------------------------ ciclo de vida
    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            raiz.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
