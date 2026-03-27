import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands';
import { StreamLanguage, bracketMatching, indentOnInput, foldGutter, foldKeymap, Language, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { json } from '@codemirror/lang-json';
import { tags } from '@lezer/highlight';

window.CM = {
  EditorView, EditorState, Compartment,
  keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars,
  drawSelection, highlightActiveLine, rectangularSelection, crosshairCursor,
  defaultKeymap, history, historyKeymap, indentWithTab, toggleComment,
  StreamLanguage, bracketMatching, indentOnInput, foldGutter, foldKeymap, Language, syntaxHighlighting, HighlightStyle,
  searchKeymap, highlightSelectionMatches,
  closeBrackets, closeBracketsKeymap,
  json,
  tags
};
