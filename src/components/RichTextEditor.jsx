import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import {
  Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link2, Link2Off,
} from 'lucide-react'

export default function RichTextEditor({ content, onChange, minHeight = 360 }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Enable the bundled Link mark, restricted to safe schemes; don't follow
        // links while editing (openOnClick) so clicking places the cursor instead.
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
        style: `min-height:${minHeight}px`,
      },
    },
  })

  // Sync external content changes (e.g. switching templates)
  useEffect(() => {
    if (editor && !editor.isDestroyed && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', false)
    }
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null

  const format = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
    ? 'h2'
    : editor.isActive('heading', { level: 3 })
    ? 'h3'
    : 'p'

  function setFormat(value) {
    if (value === 'p') editor.chain().focus().setParagraph().run()
    else editor.chain().focus().toggleHeading({ level: Number(value.replace('h', '')) }).run()
  }

  function setLink() {
    const prev = editor.getAttributes('link').href
    const url = window.prompt('Link URL (https://… or mailto:…)', prev || 'https://')
    if (url === null) return // cancelled
    if (url.trim() === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div className="border border-input rounded-md overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/50 flex-wrap">
        {/* Format */}
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="text-xs border border-input rounded px-2 py-1 bg-card focus:outline-none mr-1 h-7"
        >
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <Sep />

        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
          <Bold size={13} />
        </Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
          <Italic size={13} />
        </Btn>
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
          <UnderlineIcon size={13} />
        </Btn>

        <Sep />

        <Btn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left">
          <AlignLeft size={13} />
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align center">
          <AlignCenter size={13} />
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right">
          <AlignRight size={13} />
        </Btn>

        <Sep />

        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List size={13} />
        </Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered size={13} />
        </Btn>

        <Sep />

        <Btn active={editor.isActive('link')} onClick={setLink} title="Insert / edit link">
          <Link2 size={13} />
        </Btn>
        <Btn active={false} onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
          <Link2Off size={13} />
        </Btn>
      </div>

      {/* Content area */}
      <EditorContent editor={editor} />
    </div>
  )
}

function Btn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px h-5 bg-border mx-1 shrink-0" />
}
