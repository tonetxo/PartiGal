package com.example.partigal

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.example.partigal.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var fileUploadCallback: android.webkit.ValueCallback<Array<android.net.Uri>>? = null

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            // Permiso concedido
        }
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (fileUploadCallback != null) {
            val results = if (result.resultCode == android.app.Activity.RESULT_OK && result.data != null) {
                android.webkit.WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            } else {
                null
            }
            fileUploadCallback?.onReceiveValue(results)
            fileUploadCallback = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView()
        checkAndroidPermissions()
    }

    private fun setupWebView() {
        binding.webview.apply {
            // Configuración de Settings
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true 
                mediaPlaybackRequiresUserGesture = false 
                allowFileAccess = true
                allowContentAccess = true
            }

            webViewClient = WebViewClient()

            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread {
                        request.grant(request.resources)
                    }
                }

                // Habilitar input file
                override fun onShowFileChooser(
                    webView: android.webkit.WebView?,
                    filePathCallback: android.webkit.ValueCallback<Array<android.net.Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    if (fileUploadCallback != null) {
                        fileUploadCallback?.onReceiveValue(null)
                    }
                    fileUploadCallback = filePathCallback

                    val intent = fileChooserParams?.createIntent()
                    try {
                        if (intent != null) {
                            fileChooserLauncher.launch(intent)
                        }
                    } catch (e: Exception) {
                        fileUploadCallback = null
                        return false
                    }
                    return true
                }
            }

            loadUrl("file:///android_asset/www/index.html")
        }
    }

    private fun checkAndroidPermissions() {
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    /**
     * Métodos nativos (aún disponibles si decidimos migrar lógica JS a C++)
     */
    external fun stringFromJNI(): String

    companion object {
        init {
            System.loadLibrary("partigal")
        }
    }
}