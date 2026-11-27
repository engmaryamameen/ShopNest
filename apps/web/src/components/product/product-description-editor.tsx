'use client';

import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { productFieldSurface } from '@/components/ui/admin-form';

export function ProductDescriptionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [formatting, setFormatting] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false, link: false }), Markdown],
    content: value,
    contentType: 'markdown',
    editorProps: { attributes: { id: 'product-description', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Product description', class: 'min-h-[155px] p-3 pb-12 font-lato text-[15px] leading-6 text-[#172126] outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5' } },
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
  });

  return <div>
    <label htmlFor="product-description" className="mb-1 block text-sm font-medium text-gray-700">Product description</label>
    <div className={`relative ${productFieldSurface}`}>
      <EditorContent editor={editor} />
      <div className="absolute bottom-2 right-3 flex items-center gap-3">
        <button type="button" aria-label="Description formatting" aria-expanded={formatting} title="Description formatting" onClick={() => setFormatting(!formatting)} className="rounded text-gray-600 hover:text-[#0077b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1"/><path d="m16 5 3 3m1.385-1.415a2.1 2.1 0 0 0-2.97-2.97L9 12v3h3l8.385-8.415Z"/></svg></button>
      </div>
    </div>
    <p className="mt-1 text-right text-xs text-gray-500">{editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0} characters</p>
    {formatting && <div role="group" aria-label="Description formatting" className="mt-2 flex flex-wrap gap-2 text-sm">{[
      { label: 'Bold', active: editor?.isActive('bold'), action: () => editor?.chain().focus().toggleBold().run() },
      { label: 'Italic', active: editor?.isActive('italic'), action: () => editor?.chain().focus().toggleItalic().run() },
      { label: 'Bulleted list', active: editor?.isActive('bulletList'), action: () => editor?.chain().focus().toggleBulletList().run() },
      { label: 'Numbered list', active: editor?.isActive('orderedList'), action: () => editor?.chain().focus().toggleOrderedList().run() },
    ].map(({ label, active, action }) => <button key={label} type="button" aria-pressed={Boolean(active)} onClick={action} className="rounded border border-gray-200 px-3 py-1 hover:bg-gray-50 aria-pressed:bg-blue-50">{label}</button>)}</div>}
  </div>;
}
