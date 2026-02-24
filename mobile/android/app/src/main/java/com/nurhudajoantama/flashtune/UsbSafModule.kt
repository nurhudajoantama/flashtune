package com.nurhudajoantama.flashtune

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream

class UsbSafModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var pendingPermissionPromise: Promise? = null

  private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_OPEN_TREE) return

      val promise = pendingPermissionPromise
      pendingPermissionPromise = null

      if (promise == null) return

      if (resultCode != Activity.RESULT_OK || data?.data == null) {
        promise.reject("E_USB_PERMISSION", "USB permission was not granted")
        return
      }

      val treeUri = data.data!!
      try {
        val flags = data.flags and
          (Intent.FLAG_GRANT_READ_URI_PERMISSION or
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION)

        reactContext.contentResolver.takePersistableUriPermission(
          treeUri,
          flags or Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
        )

        reactContext
          .getSharedPreferences(PREFS_NAME, 0)
          .edit()
          .putString(PREF_USB_ROOT_URI, treeUri.toString())
          .apply()

        promise.resolve(treeUri.toString())
      } catch (e: Exception) {
        rejectPromise(promise, "E_USB_PERMISSION", "Failed to persist USB permission.", e)
      }
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "UsbSafModule"

  @ReactMethod
  fun requestPermission(promise: Promise) {
    try {
      val persisted = getPersistedUsbRootUri()
      if (persisted != null) {
        promise.resolve(persisted)
        return
      }

      if (pendingPermissionPromise != null) {
        promise.reject("E_USB_PERMISSION", "USB permission request is already in progress")
        return
      }

      val activity = reactContext.currentActivity
      if (activity == null) {
        promise.reject("E_USB_PERMISSION", "No foreground activity available to request USB permission")
        return
      }

      pendingPermissionPromise = promise

      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
      }

      activity.startActivityForResult(intent, REQUEST_OPEN_TREE)
    } catch (e: Exception) {
      pendingPermissionPromise = null
      rejectPromise(promise, "E_USB_PERMISSION", "Unable to read persisted USB permission.", e)
    }
  }

  @ReactMethod
  fun clearPermission(promise: Promise) {
    try {
      val stored = reactContext
        .getSharedPreferences(PREFS_NAME, 0)
        .getString(PREF_USB_ROOT_URI, null)

      if (!stored.isNullOrBlank()) {
        val uri = Uri.parse(stored)
        try {
          reactContext.contentResolver.releasePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
          )
        } catch (_: Exception) {}
      }

      for (perm in reactContext.contentResolver.persistedUriPermissions.toList()) {
        try {
          reactContext.contentResolver.releasePersistableUriPermission(
            perm.uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
          )
        } catch (_: Exception) {}
      }

      reactContext
        .getSharedPreferences(PREFS_NAME, 0)
        .edit()
        .remove(PREF_USB_ROOT_URI)
        .apply()

      promise.resolve(null)
    } catch (e: Exception) {
      rejectPromise(promise, "E_USB_CLEAR", "Failed to clear USB permission.", e)
    }
  }

  @ReactMethod
  fun listDirectory(uri: String, promise: Promise) {
    try {
      val dir = resolveExistingDocument(uri)
      if (dir == null || !dir.exists()) {
        promise.reject("E_LIST_DIRECTORY", "Directory does not exist: $uri")
        return
      }
      if (!dir.isDirectory) {
        promise.reject("E_LIST_DIRECTORY", "URI is not a directory: $uri")
        return
      }

      val items = Arguments.createArray()
      for (child in dir.listFiles()) {
        val entry = Arguments.createMap()
        entry.putString("name", child.name ?: "")
        entry.putBoolean("isDirectory", child.isDirectory)
        entry.putDouble("size", child.length().toDouble())
        items.pushMap(entry)
      }
      promise.resolve(items)
    } catch (e: Exception) {
      rejectPromise(promise, "E_LIST_DIRECTORY", "Failed to list directory: $uri", e)
    }
  }

  @ReactMethod
  fun writeFile(dirUri: String, filename: String, sourcePath: String, promise: Promise) {
    try {
      val srcFile = File(sourcePath)
      if (!srcFile.exists() || !srcFile.isFile) {
        promise.reject("E_WRITE_FILE", "Source file does not exist: $sourcePath")
        return
      }

      if (filename.isBlank()) {
        promise.reject("E_WRITE_FILE", "Filename is required")
        return
      }

      val dir = resolveRootDirectory(dirUri)
      if (dir == null || !dir.exists() || !dir.isDirectory) {
        promise.reject("E_WRITE_FILE", "Directory is invalid: $dirUri")
        return
      }

      val existing = dir.findFile(filename)
      val destination = when {
        existing == null -> dir.createFile("audio/mpeg", filename)
        existing.isDirectory -> null
        else -> existing
      }

      if (destination == null) {
        promise.reject("E_WRITE_FILE", "Unable to create destination file: $filename")
        return
      }

      reactContext.contentResolver.openOutputStream(destination.uri, "wt")?.use { out ->
        FileInputStream(srcFile).use { input ->
          copyStream(input, out)
        }
      } ?: run {
        promise.reject("E_WRITE_FILE", "Unable to open destination stream: $filename")
        return
      }

      promise.resolve(null)
    } catch (e: Exception) {
      rejectPromise(promise, "E_WRITE_FILE", "Failed to write file to USB.", e)
    }
  }

  @ReactMethod
  fun renameFile(fileUri: String, newName: String, promise: Promise) {
    try {
      val file = resolveExistingDocument(fileUri)
      if (file == null || !file.exists() || file.isDirectory) {
        promise.reject("E_RENAME_FILE", "File does not exist: $fileUri")
        return
      }

      val targetName = newName.trim()
      if (targetName.isBlank()) {
        promise.reject("E_RENAME_FILE", "New filename is required")
        return
      }

      val renamedUri = DocumentsContract.renameDocument(
        reactContext.contentResolver,
        file.uri,
        targetName,
      )

      if (renamedUri == null) {
        promise.reject("E_RENAME_FILE", "Unable to rename file: $fileUri")
        return
      }

      promise.resolve(renamedUri.toString())
    } catch (e: Exception) {
      rejectPromise(promise, "E_RENAME_FILE", "Failed to rename file.", e)
    }
  }

  @ReactMethod
  fun deleteFile(uri: String, promise: Promise) {
    try {
      val file = resolveExistingDocument(uri)
      if (file == null || !file.exists()) {
        promise.reject("E_DELETE_FILE", "File does not exist: $uri")
        return
      }

      if (!file.delete()) {
        promise.reject("E_DELETE_FILE", "Unable to delete file: $uri")
        return
      }

      promise.resolve(null)
    } catch (e: Exception) {
      rejectPromise(promise, "E_DELETE_FILE", "Failed to delete file.", e)
    }
  }

  @ReactMethod
  fun getStorageInfo(uri: String, promise: Promise) {
    try {
      val rootUri = resolveRootUri(uri)
      val volumeId = extractVolumeId(rootUri)
      val storagePath = if (volumeId == "primary") {
        Environment.getExternalStorageDirectory()
      } else {
        File("/storage/$volumeId")
      }

      if (!storagePath.exists()) {
        promise.reject("E_STORAGE_INFO", "Unable to resolve storage path for volume: $volumeId")
        return
      }

      val stat = StatFs(storagePath.absolutePath)
      val total = stat.blockCountLong * stat.blockSizeLong
      val free = stat.availableBlocksLong * stat.blockSizeLong
      val used = total - free

      val map = Arguments.createMap()
      map.putDouble("used", used.toDouble())
      map.putDouble("free", free.toDouble())
      map.putDouble("total", total.toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      rejectPromise(promise, "E_STORAGE_INFO", "Failed to get storage info.", e)
    }
  }

  private fun resolveExistingDocument(targetUri: String): DocumentFile? {
    val treeMatch = matchRootAndSegments(targetUri)
    if (treeMatch != null) {
      val rootDoc = resolveRootDirectory(treeMatch.first.toString()) ?: return null
      var current: DocumentFile = rootDoc
      for (segment in treeMatch.second) {
        val next = current.findFile(segment) ?: return null
        current = next
      }
      return current
    }

    val parsed = Uri.parse(targetUri)
    val single = DocumentFile.fromSingleUri(reactContext, parsed)
    if (single != null && single.exists()) return single

    val tree = DocumentFile.fromTreeUri(reactContext, parsed)
    if (tree != null && tree.exists()) return tree

    return null
  }

  private fun resolveRootDirectory(rootUri: String): DocumentFile? {
    val uri = Uri.parse(rootUri)
    val root = DocumentFile.fromTreeUri(reactContext, uri)
    return if (root != null && root.exists()) root else null
  }

  private fun resolveRootUri(inputUri: String): Uri {
    val treeMatch = matchRootAndSegments(inputUri)
    if (treeMatch != null) {
      return treeMatch.first
    }
    return Uri.parse(inputUri)
  }

  private fun matchRootAndSegments(rawUri: String): Pair<Uri, List<String>>? {
    val roots = persistedRootCandidates()
    val match = roots
      .sortedByDescending { it.length }
      .firstOrNull { rawUri == it || rawUri.startsWith("$it/") }
      ?: return null

    val relative = if (rawUri.length == match.length) "" else rawUri.substring(match.length + 1)
    val segments = relative
      .split('/')
      .map { Uri.decode(it) }
      .filter { it.isNotBlank() }

    return Pair(Uri.parse(match), segments)
  }

  private fun persistedRootCandidates(): List<String> {
    val values = LinkedHashSet<String>()

    val prefUri = reactContext
      .getSharedPreferences(PREFS_NAME, 0)
      .getString(PREF_USB_ROOT_URI, null)
    if (!prefUri.isNullOrBlank()) {
      values.add(prefUri)
    }

    for (perm in reactContext.contentResolver.persistedUriPermissions) {
      val uriValue = perm.uri?.toString()
      if (!uriValue.isNullOrBlank()) {
        values.add(uriValue)
      }
    }

    return values.toList()
  }

  private fun getPersistedUsbRootUri(): String? {
    val stored = reactContext
      .getSharedPreferences(PREFS_NAME, 0)
      .getString(PREF_USB_ROOT_URI, null)

    if (!stored.isNullOrBlank()) {
      val hasPermission = reactContext.contentResolver.persistedUriPermissions.any {
        it.uri.toString() == stored && (it.isReadPermission || it.isWritePermission)
      }
      if (hasPermission) {
        return stored
      }
    }

    val permission = reactContext.contentResolver.persistedUriPermissions.firstOrNull {
      it.isReadPermission || it.isWritePermission
    }

    val candidate = permission?.uri?.toString()
    if (!candidate.isNullOrBlank()) {
      reactContext
        .getSharedPreferences(PREFS_NAME, 0)
        .edit()
        .putString(PREF_USB_ROOT_URI, candidate)
        .apply()
      return candidate
    }

    return null
  }

  private fun extractVolumeId(uri: Uri): String {
    val docId = try {
      DocumentsContract.getTreeDocumentId(uri)
    } catch (_: IllegalArgumentException) {
      DocumentsContract.getDocumentId(uri)
    }

    val parts = docId.split(":", limit = 2)
    if (parts.isEmpty() || parts[0].isBlank()) {
      throw IllegalArgumentException("Invalid document ID for URI: $uri")
    }
    return parts[0]
  }

  private fun copyStream(input: java.io.InputStream, output: java.io.OutputStream) {
    val buffer = ByteArray(BUFFER_SIZE)
    while (true) {
      val read = input.read(buffer)
      if (read <= 0) break
      output.write(buffer, 0, read)
    }
    output.flush()
  }

  private fun rejectPromise(promise: Promise, code: String, message: String, error: Throwable) {
    val details = error.message?.takeIf { it.isNotBlank() }
    val finalMessage = if (details == null) message else "$message $details"
    promise.reject(code, finalMessage, error)
  }

  companion object {
    private const val REQUEST_OPEN_TREE = 43001
    private const val PREFS_NAME = "UsbSafModulePrefs"
    private const val PREF_USB_ROOT_URI = "usb_root_uri"
    private const val BUFFER_SIZE = 8192
  }
}
