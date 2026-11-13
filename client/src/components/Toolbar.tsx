import { useEditorState, type Editor } from '@tiptap/react';

type Block = 'p' | 'h1' | 'h2' | 'h3';

export function Toolbar({ editor, onImport, importing }: { editor: Editor; onImport: () => void; importing: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      block: (e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p') as Block,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function setBlock(b: Block) {
    if (b === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(b[1]) as 1 | 2 | 3 }).run();
  }

  function toggleLink() {
    if (s.link) {
      chain().unsetLink().run();
      return;
    }
    const url = window.prompt('Link URL', 'https://');
    if (!url || url === 'https://') return;
    if (!/^(https?:|mailto:)/i.test(url)) {
      window.alert('Links must start with http://, https:// or mailto:');
      return;
    }
    chain().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Undo (⌘Z)" onClick={() => chain().undo().run()} disabled={!s.canUndo}>
        ↶
      </Btn>
      <Btn label="Redo (⌘⇧Z)" onClick={() => chain().redo().run()} disabled={!s.canRedo}>
        ↷
      </Btn>
      <Sep />
      <select
        aria-label="Text style"
        value={s.block}
        onChange={(e) => setBlock(e.target.value as Block)}
        className="block-select"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Sep />
      <Btn label="Bold (⌘B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </Btn>
      <Btn label="Italic (⌘I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <i>I</i>
      </Btn>
      <Btn label="Underline (⌘U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </Btn>
      <Btn label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </Btn>
      <Btn label="Link" active={s.link} onClick={toggleLink}>
        🔗
      </Btn>
      <Sep />
      <Btn label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        • List
      </Btn>
      <Btn label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        1. List
      </Btn>
      <Btn label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        ❝
      </Btn>
      <Sep />
      <Btn label="Insert content from a .txt, .md or .docx file at the cursor" onClick={onImport} disabled={importing}>
        {importing ? 'Importing…' : 'Import file'}
      </Btn>
    </div>
  );
}

function Btn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? ' active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor selection when clicking toolbar buttons.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="tb-sep" aria-hidden />;
}
