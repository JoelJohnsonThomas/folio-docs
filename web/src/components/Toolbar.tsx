import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  FileInput,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

type Block = 'p' | 'h1' | 'h2' | 'h3';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

export function Toolbar({ editor, onInsertFile, importing }: { editor: Editor; onInsertFile: () => void; importing: boolean }) {
  // Re-render only when the formatting state at the cursor actually changes.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
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

  const setBlock = (b: Block) => {
    if (b === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(b[1]) as 1 | 2 | 3 }).run();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn icon={Undo2} label={`Undo (${mod}Z)`} onClick={() => chain().undo().run()} disabled={!s.canUndo} />
      <Btn icon={Redo2} label={`Redo (${mod}Shift+Z)`} onClick={() => chain().redo().run()} disabled={!s.canRedo} />
      <Sep />
      <select
        className="block-select"
        value={s.block}
        onChange={(e) => setBlock(e.target.value as Block)}
        aria-label="Text style"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Sep />
      <Btn icon={Bold} label={`Bold (${mod}B)`} active={s.bold} onClick={() => chain().toggleBold().run()} />
      <Btn icon={Italic} label={`Italic (${mod}I)`} active={s.italic} onClick={() => chain().toggleItalic().run()} />
      <Btn icon={Underline} label={`Underline (${mod}U)`} active={s.underline} onClick={() => chain().toggleUnderline().run()} />
      <Btn icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} />
      <Btn icon={Code} label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()} />
      <Sep />
      <Btn icon={List} label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()} />
      <Btn icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <Btn icon={Quote} label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
      <Btn icon={Minus} label="Divider" onClick={() => chain().setHorizontalRule().run()} />
      <Sep />
      <Btn icon={RemoveFormatting} label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()} />
      <div className="spacer" />
      <button className="tb-btn tb-text" onClick={onInsertFile} disabled={importing} title="Insert the contents of a .txt, .md or .docx file at the cursor">
        <FileInput size={16} /> {importing ? 'Inserting…' : 'Insert from file'}
      </button>
    </div>
  );
}

function Btn(props: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      className={`tb-btn${props.active ? ' active' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      // Keep focus (and the selection) in the editor.
      onMouseDown={(e) => e.preventDefault()}
    >
      <Icon size={17} strokeWidth={2.1} />
    </button>
  );
}

const Sep = () => <span className="tb-sep" aria-hidden="true" />;
