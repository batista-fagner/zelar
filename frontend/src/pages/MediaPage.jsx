import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, Image, Loader2, AlertCircle, X, Check, Play, Pencil } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MediaPage() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [name, setName] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renamingLoading, setRenamingLoading] = useState(false)
  const fileInputRef = useRef(null)
  const renameInputRef = useRef(null)

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${API_URL}/media`)
      const data = await res.json()
      setFiles(data)
    } catch {
      setError('Não foi possível carregar as mídias.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFiles() }, [])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setSelectedFile(file)
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile || !name.trim()) return
    setError(null)
    setSuccess(null)
    setUploading(true)

    try {
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('name', name.trim())

      const res = await fetch(`${API_URL}/media/upload`, { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) {
        setError(data?.message ?? 'Erro ao fazer upload.')
        return
      }

      setFiles(prev => [data, ...prev])
      setSelectedFile(null)
      setName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSuccess(`"${data.name}" enviado com sucesso!`)
      setTimeout(() => setSuccess(null), 4000)
    } catch {
      setError('Não foi possível fazer o upload. Verifique sua internet.')
    } finally {
      setUploading(false)
    }
  }

  const startRename = (file) => {
    setRenamingId(file.id)
    setRenameValue(file.name)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  const handleRename = async (id) => {
    if (!renameValue.trim()) return
    setRenamingLoading(true)
    try {
      const res = await fetch(`${API_URL}/media/${id}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.message ?? 'Erro ao renomear.')
        return
      }
      setFiles(prev => prev.map(f => f.id === id ? { ...f, name: data.name } : f))
      setRenamingId(null)
    } catch {
      setError('Não foi possível renomear.')
    } finally {
      setRenamingLoading(false)
    }
  }

  const handleDelete = async (id) => {
    setShowConfirmDelete(null)
    setDeletingId(id)
    try {
      await fetch(`${API_URL}/media/${id}`, { method: 'DELETE' })
      setFiles(prev => prev.filter(f => f.id !== id))
    } catch {
      setError('Não foi possível remover a mídia.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Mídias</h1>
      <p className="text-sm text-gray-500 mb-6">
        Faça upload de imagens e vídeos. A IA identifica cada mídia pelo nome para enviá-las automaticamente na conversa com o paciente.
      </p>

      {/* Upload Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Adicionar nova mídia</h2>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              dragging ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {selectedFile ? (
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-teal-700">
                  <Check className="w-5 h-5" />
                  <span className="text-sm font-medium">{selectedFile.name}</span>
                </div>
                <p className="text-xs text-gray-400">{formatSize(selectedFile.size)} — clique para trocar</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-sm text-gray-500">Arraste um arquivo aqui ou <span className="text-teal-600 font-medium">clique para selecionar</span></p>
                <p className="text-xs text-gray-400">Imagens e vídeos — máx. 50 MB</p>
              </div>
            )}
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Nome da mídia <span className="text-gray-400">(a IA usa este nome para identificar)</span>
            </label>
            <input
              type="text"
              placeholder='Ex: video-apresentacao, imagem-fisioterapia'
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">Sem espaços ou caracteres especiais. Use traço para separar palavras.</p>
          </div>

          <button
            onClick={handleUpload}
            disabled={!selectedFile || !name.trim() || uploading}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Enviando...' : 'Fazer upload'}
          </button>
        </div>
      </div>

      {/* Feedback */}
      {success && (
        <div className="mb-4 flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Lista de mídias */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Mídias cadastradas</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
            <span className="text-sm text-gray-500">Carregando...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <Image className="w-8 h-8" />
            <p className="text-sm">Nenhuma mídia cadastrada ainda</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {files.map(file => (
              <div key={file.id} className="flex items-center gap-4 px-6 py-4">
                {/* Preview clicável */}
                <div
                  onClick={() => setPreviewFile(file)}
                  className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 cursor-pointer hover:opacity-80 transition relative group"
                >
                  {file.mimeType?.startsWith('image/') ? (
                    <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                      <Play className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Play className="w-4 h-4 text-white" />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {renamingId === file.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(file.id)
                          if (e.key === 'Escape') cancelRename()
                        }}
                        className="flex-1 px-2 py-1 text-sm border border-teal-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        onClick={() => handleRename(file.id)}
                        disabled={renamingLoading}
                        className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition"
                      >
                        {renamingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={cancelRename} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg transition">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 group/name">
                      <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                      <button
                        onClick={() => startRename(file)}
                        className="opacity-0 group-hover/name:opacity-100 p-0.5 text-gray-400 hover:text-teal-600 transition"
                        title="Renomear"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {file.mimeType} {file.size ? `· ${formatSize(file.size)}` : ''}
                  </p>
                </div>

                {/* Delete */}
                <button
                  onClick={() => setShowConfirmDelete(file)}
                  disabled={deletingId === file.id || renamingId === file.id}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                >
                  {deletingId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de preview */}
      {previewFile && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="relative max-w-3xl w-full"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewFile(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition"
            >
              <X className="w-6 h-6" />
            </button>
            <p className="text-white text-sm font-medium mb-3 text-center">{previewFile.name}</p>
            {previewFile.mimeType?.startsWith('image/') ? (
              <img
                src={previewFile.url}
                alt={previewFile.name}
                className="w-full rounded-xl max-h-[80vh] object-contain"
              />
            ) : (
              <video
                src={previewFile.url}
                controls
                autoPlay
                className="w-full rounded-xl max-h-[80vh]"
              />
            )}
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Remover mídia?</h3>
                <p className="text-xs text-gray-500 mt-0.5">"{showConfirmDelete.name}" será removida permanentemente.</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirmDelete(null)}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(showConfirmDelete.id)}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
