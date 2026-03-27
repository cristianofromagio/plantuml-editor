
// PlantUML Language Support for CodeMirror 6
// Adapted from the comprehensive TextMate grammar (resources/plantuml.tmLanguage)
// Provides syntax highlighting via a StreamLanguage-compatible mode

(function() {
  'use strict';

  // Keyword Categories extracted from TM Grammar
  const DIAGRAM_BLOCKS = /^(?:@start[a-z]+|@end[a-z]+)\b/i;
  
  const KEYWORDS_BEGIN_LINE = [
    'switch', 'case', 'usecase', 'actor', 'object', 'participant', 'boundary', 'control', 'entity', 'database',
    'create', 'component', 'interface', 'package', 'node', 'folder', 'frame', 'cloud', 'annotation', 'enum',
    'abstract class', 'abstract', 'class', 'state', 'autonumber', 'activate', 'deactivate', 'return', 'destroy',
    'newpage', 'alt', 'else', 'opt', 'loop', 'par', 'break', 'critical', 'group', 'box', 'rectangle', 'namespace',
    'partition', 'agent', 'artifact', 'card', 'circle', 'collections', 'file', 'hexagon', 'label', 'person',
    'queue', 'stack', 'storage', 'mainframe', 'map', 'repeat', 'backward', 'diamond', 'goto', 'binary', 'clock',
    'concise', 'robust', 'compact concise', 'compact robust', 'json', 'protocol', 'struct', 'exception',
    'metaclass', 'stereotype', 'skinparam', 'note', 'hnote', 'rnote', 'title', 'header', 'footer', 'legend', 'caption'
  ];

  const KEYWORDS_WHOLE_LINE = [
    'endswitch', 'split again', 'split', 'endif', 'repeat', 'start', 'stop', 'end', 'end fork', 'end split',
    'fork again', 'fork', 'detach', 'end box', 'top to bottom direction', 'left to right direction', 'kill',
    'end merge', 'allow_mixing', 'allowmixing', 'end title', 'end header', 'end footer', 'end legend'
  ];

  const PREPROCESSOR = [
    '!includesub', '!include', '!enddefinelong', '!definelong', '!define', '!startsub', '!endsub',
    '!ifdef', '!else', '!endif', '!ifndef', '!if', '!elseif', '!endif', '!while', '!endwhile',
    '!unquoted procedure', '!final procedure', '!procedure', '!unquoted function', '!final function', '!function',
    '!end function', '!end procedure', '!return', '!import', '!includedef', '!includeurl', '!include_many',
    '!include_once', '!log', '!dump_memory', '!theme', '!pragma', '!assume transparent'
  ];

  // Complex Arrow Regex (Adapted from TM Grammar)
  // Logic: matches heads, then the line (-, ., ~, =), then optional color/direction, then the other head
  const ARROW_REGEX = /^(?:(?:\s+[ox]|[+*])?(?:<<|<\|?|\\\\|\\|\/\/|\}|\^|#|0|0\))?)(?:[-.~=]+)(?:\[(?:#(?:[0-9a-f]{6}|[0-9a-f]{3}|\w+)(?:[-\\/](?:[0-9a-f]{6}|[0-9a-f]{3}|\w+))?\b)\])?(?:(left|right|up|down)(?:[-.~=]))?[-.]*(?:(?:>>|\|?>|\\\\|\\|\/\/|\{|\^|#|0|\(0)?(?:[ox]\s+|[+*])?)/i;

  window.plantumlMode = {
    name: 'plantuml',

    startState: function() {
      return {
        inBlockComment: false,
        inString: false,
        inNote: false
      };
    },

    token: function(stream, state) {
      // Skip whitespace
      if (stream.eatSpace()) return null;

      // Block comment
      if (state.inBlockComment) {
        if (stream.match("'/")) {
          state.inBlockComment = false;
          return 'comment';
        }
        stream.next();
        return 'comment';
      }

      // Start block comment
      if (stream.match("/'")) {
        state.inBlockComment = true;
        return 'comment';
      }

      // Single-line comment
      if (stream.match("'")) {
        stream.skipToEnd();
        return 'comment';
      }

      // Strings
      if (stream.match('"')) {
        while (!stream.eol()) {
          const ch = stream.next();
          if (ch === '"') break;
          if (ch === '\\') stream.next();
        }
        return 'string';
      }

      // Diagram Blocks (@startuml, etc.)
      if (stream.match(DIAGRAM_BLOCKS)) {
        return 'keyword';
      }

      // Preprocessor Directives (including multi-word ones)
      for (const p of PREPROCESSOR) {
        if (stream.match(p, true, true)) { // Case-insensitive matching
          return 'preprocessor';
        }
      }

      // Preprocessor Variables
      if (stream.match(/^!\$\w+/)) {
        return 'variable';
      }

      // Arrows (Complex)
      if (stream.match(ARROW_REGEX)) {
        return 'arrow';
      }

      // Whole Line Keywords
      for (const kw of KEYWORDS_WHOLE_LINE) {
        if (stream.match(kw, true, true)) {
          return 'keyword';
        }
      }

      // Line Start Keywords
      for (const kw of KEYWORDS_BEGIN_LINE) {
        if (stream.match(kw, true, true)) {
          return 'keyword';
        }
      }

      // Standard Keywords (standalone)
      if (stream.match(/^(?:as|is|on|of|has|then|implements|extends)\b/i)) {
        return 'keyword';
      }

      // Color literals
      if (stream.match(/#[0-9a-fA-F]{3,8}\b/)) {
        return 'color';
      }
      
      // Standard color names (e.g. #red)
      if (stream.match(/#\w+/)) {
        return 'color';
      }

      // Stereotypes <<...>>
      if (stream.match(/<<[^>]*>>/)) {
        return 'tag';
      }

      // Numbers
      if (stream.match(/\b\d+(\.\d+)?\b/)) {
        return 'number';
      }

      // Brackets / Braces
      if (stream.match(/[{}()\[\]]/)) {
        return 'bracket';
      }

      // Operators
      if (stream.match(/[:;=|*+]/)) {
        return 'operator';
      }

      // Identifiers
      if (stream.match(/^[a-zA-Z_]\w*/)) {
        const word = stream.current().toLowerCase();
        if (word === 'true' || word === 'false' || word === 'null') {
          return 'keyword';
        }
        return null;
      }

      stream.next();
      return null;
    }
  };
})();
