package com.example.partigal

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.example.partigal.databinding.ActivityMainBinding
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var fileUploadCallback: android.webkit.ValueCallback<Array<android.net.Uri>>? = null

    // Native Bridge
    inner class WebAppInterface {
        
        @JavascriptInterface
        fun saveFile(base64Data: String, fileName: String) {
            Log.d("PartiGal", "Bridge called: saveFile for $fileName") // DEBUG LOG
            try {
                // Remove header if present (data:audio/midi;base64,...)
                val cleanBase64 = if (base64Data.contains(",")) {
                    base64Data.split(",")[1]
                } else {
                    base64Data
                }

                val decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                saveToDownloads(decodedBytes, fileName)
                
            } catch (e: Exception) {
                e.printStackTrace()
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Error guardando: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun saveToDownloads(bytes: ByteArray, fileName: String) {
        val resolver = contentResolver
        val contentValues = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, "audio/midi")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
        }

        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)

        if (uri != null) {
            try {
                resolver.openOutputStream(uri)?.use { outputStream ->
                    outputStream.write(bytes)
                }
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Archivo guardado en Descargas: $fileName", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Error escribiendo archivo", Toast.LENGTH_SHORT).show()
                }
            }
        } else {
            // Fallback for older Android versions or failures (Simplified)
            runOnUiThread {
                Toast.makeText(this@MainActivity, "No se pudo crear el archivo", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ... (FileChooser Logic) ...
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (fileUploadCallback != null) {
            val results = if (result.resultCode == android.app.Activity.RESULT_OK && result.data != null) {
                android.webkit.WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            } else { null }
            fileUploadCallback?.onReceiveValue(results)
            fileUploadCallback = null
        }
    }

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView()
        checkAndroidPermissions()
    }

    private fun setupWebView() {
        binding.webview.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true 
                mediaPlaybackRequiresUserGesture = false 
                allowFileAccess = true
                allowContentAccess = true
                allowUniversalAccessFromFileURLs = true
            }

            addJavascriptInterface(WebAppInterface(), "AndroidInterface")

            webViewClient = WebViewClient()

            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread { request.grant(request.resources) }
                }

                override fun onShowFileChooser(
                    webView: android.webkit.WebView?,
                    filePathCallback: android.webkit.ValueCallback<Array<android.net.Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    fileUploadCallback = filePathCallback
                    val intent = fileChooserParams?.createIntent()
                    try { fileChooserLauncher.launch(intent) } 
                    catch (e: Exception) { 
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
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    external fun stringFromJNI(): String

    companion object {
        init { System.loadLibrary("partigal") }
    }
}