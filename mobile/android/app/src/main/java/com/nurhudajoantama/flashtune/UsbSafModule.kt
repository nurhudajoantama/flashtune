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
import java.io.FileOutputStream

class UsbSafModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var pendingPermissionPromise: Promise? = null

  private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
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

      val activity = currentActivity
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
  fun writeFile(destUri: String, sourcePath: String, promise: Promise) {
    try {
      val srcFile = File(sourcePath)
      if (!srcFile.exists() || !srcFile.isFile) {
        promise.reject("E_WRITE_FILE", "Source file does not exist: $sourcePath")
        return
      }

      val destination = resolveDocumentForWrite(destUri)
      if (destination == null || destination.isDirectory) {
        promise.reject("E_WRITE_FILE", "Destination file is invalid: $destUri")
        return
      }

      reactContext.contentResolver.openOutputStream(destination.uri, "wt")?.use { out ->
        FileInputStream(srcFile).use { input ->
          copyStream(input, out)
        }
      } ?: run {
        promise.reject("E_WRITE_FILE", "Unable to open destination stream: $destUri")
        return
      }

      promise.resolve(null)
    } catch (e: Exception) {
      rejectPromise(promise, "E_WRITE_FILE", "Failed to write file to USB.", e)
    }
  }

  @ReactMethod
  fun readFile(sourceUri: String, destPath: String, promise: Promise) {
    try {
      val source = resolveExistingDocument(sourceUri)
      if (source == null || !source.exists() || source.isDirectory) {
        promise.reject("E_READ_FILE", "Source file does not exist: $sourceUri")
        return
      }

      val destinationFile = File(destPath)
      destinationFile.parentFile?.mkdirs()

      reactContext.contentResolver.openInputStream(source.uri)?.use { input ->
        FileOutputStream(destinationFile, false).use { out ->
          copyStream(input, out)
        }
      } ?: run {
        promise.reject("E_READ_FILE", "Unable to open source stream: $sourceUri")
        return
      }

      promise.resolve(null)
    } catch (e: Exception) {
      rejectPromise(promise, "E_READ_FILE", "Failed to read file from USB.", e)
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

  @ReactMethod
  fun copyDatabase(usbRootUri: String, destPath: String, promise: Promise) {
    try {
      val dbFile = resolveChildFromRoot(usbRootUri, DATABASE_FILENAME)
      if (dbFile == null || !dbFile.exists() || dbFile.isDirectory) {
        promise.reject("E_COPY_DATABASE", "USB database file not found: $DATABASE_FILENAME")
        return
      }

      val localFile = File(destPath)
      localFile.parentFile?.mkdirs()

      reactContext.contentResolver.openInputStream(dbFile.uri)?.use { input ->
        FileOutputStream(localFile, false).use { out ->
          copyStream(input, out)
        }
      } ?: run {
        promise.reject("E_COPY_DATABASE", "Unable to open USB database stream.")
        return
      }

      promise.resolve(null)
    } catch (e: Exception) {
      rejectPromise(promise, "E_COPY_DATABASE", "Failed to copy USB database.", e)
    }
  }

  @ReactMethod
  fun syncDatabase(sourcePath: String, usbRootUri: String, promise: Promise) {
    try {
      val localFile = File(sourcePath)
      if (!localFile.exists() || !localFile.isFile) {
        promise.reject("E_SYNC_DATABASE", "Local database file does not exist: $sourcePath")
        return
      }

      val root = resolveRootDirectory(usbRootUri)
      if (root == null || !root.exists() || !root.isDirectory) {
        promise.reject("E_SYNC_DATABASE", "USB root URI is invalid: $usbRootUri")
        return
      }

      val target = root.findFile(DATABASE_FILENAME)
      val dbFile = when {
        target == null -> root.createFile("application/octet-stream", DATABASE_FILENAME)
        target.isDirectory -> null
        else -> target
      }

      if (dbFile == null) {
        promise.reject("E_SYNC_DATABASE", "Unable to create USB database file: $DATABASE_FILENAME")
        return
      }

      reactContext.contentResolver.openOutputStream(dbFile.uri, "wt")?.use { out ->
        FileInputStream(localFile).use { input ->
          copyStream(input, out)
        }
      } ?: run {
        promise.reject("E_SYNC_DATABASE", "Unable to open USB database output stream.")
        return
      }

      promise.resolve(null)
    } catch (e: Exception) {
      rejectPromise(promise, "E_SYNC_DATABASE", "Failed to sync USB database.", e)
    }
  }

  private fun resolveDocumentForWrite(targetUri: String): DocumentFile? {
    val treeMatch = matchRootAndSegments(targetUri)
    if (treeMatch != null) {
      val rootDoc = resolveRootDirectory(treeMatch.first.toString()) ?: return null
      val segments = treeMatch.second
      if (segments.isEmpty()) return null

      var current = rootDoc
      for (i in 0 until segments.size - 1) {
        val segment = segments[i]
        val existing = current.findFile(segment)
        current = when {
          existing == null -> current.createDirectory(segment) ?: return null
          existing.isDirectory -> existing
          else -> return null
        }
      }

      val fileName = segments.last()
      val existing = current.findFile(fileName)
      return when {
        existing == null -> current.createFile("application/octet-stream", fileName)
        existing.isDirectory -> null
        else -> existing
      }
    }

    val direct = DocumentFile.fromSingleUri(reactContext, Uri.parse(targetUri))
    return if (direct?.exists() == true) direct else null
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

  private fun resolveChildFromRoot(rootUri: String, childName: String): DocumentFile? {
    val root = resolveRootDirectory(rootUri) ?: return null
    return root.findFile(childName)
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
    private const val DATABASE_FILENAME = ".musicdb"
    private const val BUFFER_SIZE = 8192
  }
}
