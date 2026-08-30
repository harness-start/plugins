// harness-source-hash: sha256:9fbebb317a20b6e425ce30504bb183d58ba62162fc6c0b0a96104f7e8df73e32
import {
  atomicWriteJson,
  collectOwnerHookOutput,
  digestKey,
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  extractFileTargets,
  extractShellCommand,
  isFileMutationTool,
  isRecord,
  isShellTool,
  isStopHookActive,
  ownerHookHandler,
  readStdinJson,
  withPathLock
} from "../chunks/chunk-ZOSNCDGA.mjs";
import {
  __commonJS,
  __toESM
} from "../chunks/chunk-JOC5D5YB.mjs";

// node_modules/@xmldom/xmldom/lib/conventions.js
var require_conventions = __commonJS({
  "node_modules/@xmldom/xmldom/lib/conventions.js"(exports) {
    "use strict";
    function find(list, predicate, ac) {
      if (ac === void 0) {
        ac = Array.prototype;
      }
      if (list && typeof ac.find === "function") {
        return ac.find.call(list, predicate);
      }
      for (var i = 0; i < list.length; i++) {
        if (hasOwn(list, i)) {
          var item = list[i];
          if (predicate.call(void 0, item, i, list)) {
            return item;
          }
        }
      }
    }
    function freeze(object, oc) {
      if (oc === void 0) {
        oc = Object;
      }
      if (oc && typeof oc.getOwnPropertyDescriptors === "function") {
        object = oc.create(null, oc.getOwnPropertyDescriptors(object));
      }
      return oc && typeof oc.freeze === "function" ? oc.freeze(object) : object;
    }
    function hasOwn(object, key) {
      return Object.prototype.hasOwnProperty.call(object, key);
    }
    function assign(target2, source) {
      if (target2 === null || typeof target2 !== "object") {
        throw new TypeError("target is not an object");
      }
      for (var key in source) {
        if (hasOwn(source, key)) {
          target2[key] = source[key];
        }
      }
      return target2;
    }
    var HTML_BOOLEAN_ATTRIBUTES = freeze({
      allowfullscreen: true,
      async: true,
      autofocus: true,
      autoplay: true,
      checked: true,
      controls: true,
      default: true,
      defer: true,
      disabled: true,
      formnovalidate: true,
      hidden: true,
      ismap: true,
      itemscope: true,
      loop: true,
      multiple: true,
      muted: true,
      nomodule: true,
      novalidate: true,
      open: true,
      playsinline: true,
      readonly: true,
      required: true,
      reversed: true,
      selected: true
    });
    function isHTMLBooleanAttribute(name) {
      return hasOwn(HTML_BOOLEAN_ATTRIBUTES, name.toLowerCase());
    }
    var HTML_VOID_ELEMENTS = freeze({
      area: true,
      base: true,
      br: true,
      col: true,
      embed: true,
      hr: true,
      img: true,
      input: true,
      link: true,
      meta: true,
      param: true,
      source: true,
      track: true,
      wbr: true
    });
    function isHTMLVoidElement(tagName) {
      return hasOwn(HTML_VOID_ELEMENTS, tagName.toLowerCase());
    }
    var HTML_RAW_TEXT_ELEMENTS = freeze({
      script: false,
      style: false,
      textarea: true,
      title: true
    });
    function isHTMLRawTextElement(tagName) {
      var key = tagName.toLowerCase();
      return hasOwn(HTML_RAW_TEXT_ELEMENTS, key) && !HTML_RAW_TEXT_ELEMENTS[key];
    }
    function isHTMLEscapableRawTextElement(tagName) {
      var key = tagName.toLowerCase();
      return hasOwn(HTML_RAW_TEXT_ELEMENTS, key) && HTML_RAW_TEXT_ELEMENTS[key];
    }
    function isHTMLMimeType(mimeType) {
      return mimeType === MIME_TYPE.HTML;
    }
    function hasDefaultHTMLNamespace(mimeType) {
      return isHTMLMimeType(mimeType) || mimeType === MIME_TYPE.XML_XHTML_APPLICATION;
    }
    var MIME_TYPE = freeze({
      /**
       * `text/html`, the only mime type that triggers treating an XML document as HTML.
       *
       * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
       * @see https://en.wikipedia.org/wiki/HTML Wikipedia
       * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
       * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring
       *      WHATWG HTML Spec
       */
      HTML: "text/html",
      /**
       * `application/xml`, the standard mime type for XML documents.
       *
       * @see https://www.iana.org/assignments/media-types/application/xml IANA MimeType
       *      registration
       * @see https://tools.ietf.org/html/rfc7303#section-9.1 RFC 7303
       * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
       */
      XML_APPLICATION: "application/xml",
      /**
       * `text/xml`, an alias for `application/xml`.
       *
       * @see https://tools.ietf.org/html/rfc7303#section-9.2 RFC 7303
       * @see https://www.iana.org/assignments/media-types/text/xml IANA MimeType registration
       * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
       */
      XML_TEXT: "text/xml",
      /**
       * `application/xhtml+xml`, indicates an XML document that has the default HTML namespace,
       * but is parsed as an XML document.
       *
       * @see https://www.iana.org/assignments/media-types/application/xhtml+xml IANA MimeType
       *      registration
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument WHATWG DOM Spec
       * @see https://en.wikipedia.org/wiki/XHTML Wikipedia
       */
      XML_XHTML_APPLICATION: "application/xhtml+xml",
      /**
       * `image/svg+xml`,
       *
       * @see https://www.iana.org/assignments/media-types/image/svg+xml IANA MimeType registration
       * @see https://www.w3.org/TR/SVG11/ W3C SVG 1.1
       * @see https://en.wikipedia.org/wiki/Scalable_Vector_Graphics Wikipedia
       */
      XML_SVG_IMAGE: "image/svg+xml"
    });
    var _MIME_TYPES = Object.keys(MIME_TYPE).map(function(key) {
      return MIME_TYPE[key];
    });
    function isValidMimeType(mimeType) {
      return _MIME_TYPES.indexOf(mimeType) > -1;
    }
    var NAMESPACE = freeze({
      /**
       * The XHTML namespace.
       *
       * @see http://www.w3.org/1999/xhtml
       */
      HTML: "http://www.w3.org/1999/xhtml",
      /**
       * The SVG namespace.
       *
       * @see http://www.w3.org/2000/svg
       */
      SVG: "http://www.w3.org/2000/svg",
      /**
       * The `xml:` namespace.
       *
       * @see http://www.w3.org/XML/1998/namespace
       */
      XML: "http://www.w3.org/XML/1998/namespace",
      /**
       * The `xmlns:` namespace.
       *
       * @see https://www.w3.org/2000/xmlns/
       */
      XMLNS: "http://www.w3.org/2000/xmlns/"
    });
    exports.assign = assign;
    exports.find = find;
    exports.freeze = freeze;
    exports.HTML_BOOLEAN_ATTRIBUTES = HTML_BOOLEAN_ATTRIBUTES;
    exports.HTML_RAW_TEXT_ELEMENTS = HTML_RAW_TEXT_ELEMENTS;
    exports.HTML_VOID_ELEMENTS = HTML_VOID_ELEMENTS;
    exports.hasDefaultHTMLNamespace = hasDefaultHTMLNamespace;
    exports.hasOwn = hasOwn;
    exports.isHTMLBooleanAttribute = isHTMLBooleanAttribute;
    exports.isHTMLRawTextElement = isHTMLRawTextElement;
    exports.isHTMLEscapableRawTextElement = isHTMLEscapableRawTextElement;
    exports.isHTMLMimeType = isHTMLMimeType;
    exports.isHTMLVoidElement = isHTMLVoidElement;
    exports.isValidMimeType = isValidMimeType;
    exports.MIME_TYPE = MIME_TYPE;
    exports.NAMESPACE = NAMESPACE;
  }
});

// node_modules/@xmldom/xmldom/lib/errors.js
var require_errors = __commonJS({
  "node_modules/@xmldom/xmldom/lib/errors.js"(exports) {
    "use strict";
    var conventions = require_conventions();
    function extendError(constructor, writableName) {
      constructor.prototype = Object.create(Error.prototype, {
        constructor: { value: constructor },
        name: { value: constructor.name, enumerable: true, writable: writableName }
      });
    }
    var DOMExceptionName = conventions.freeze({
      /**
       * the default value as defined by the spec
       */
      Error: "Error",
      /**
       * @deprecated
       * Use RangeError instead.
       */
      IndexSizeError: "IndexSizeError",
      /**
       * @deprecated
       * Just to match the related static code, not part of the spec.
       */
      DomstringSizeError: "DomstringSizeError",
      HierarchyRequestError: "HierarchyRequestError",
      WrongDocumentError: "WrongDocumentError",
      InvalidCharacterError: "InvalidCharacterError",
      /**
       * @deprecated
       * Just to match the related static code, not part of the spec.
       */
      NoDataAllowedError: "NoDataAllowedError",
      NoModificationAllowedError: "NoModificationAllowedError",
      NotFoundError: "NotFoundError",
      NotSupportedError: "NotSupportedError",
      InUseAttributeError: "InUseAttributeError",
      InvalidStateError: "InvalidStateError",
      SyntaxError: "SyntaxError",
      InvalidModificationError: "InvalidModificationError",
      NamespaceError: "NamespaceError",
      /**
       * @deprecated
       * Use TypeError for invalid arguments,
       * "NotSupportedError" DOMException for unsupported operations,
       * and "NotAllowedError" DOMException for denied requests instead.
       */
      InvalidAccessError: "InvalidAccessError",
      /**
       * @deprecated
       * Just to match the related static code, not part of the spec.
       */
      ValidationError: "ValidationError",
      /**
       * @deprecated
       * Use TypeError instead.
       */
      TypeMismatchError: "TypeMismatchError",
      SecurityError: "SecurityError",
      NetworkError: "NetworkError",
      AbortError: "AbortError",
      /**
       * @deprecated
       * Just to match the related static code, not part of the spec.
       */
      URLMismatchError: "URLMismatchError",
      QuotaExceededError: "QuotaExceededError",
      TimeoutError: "TimeoutError",
      InvalidNodeTypeError: "InvalidNodeTypeError",
      DataCloneError: "DataCloneError",
      EncodingError: "EncodingError",
      NotReadableError: "NotReadableError",
      UnknownError: "UnknownError",
      ConstraintError: "ConstraintError",
      DataError: "DataError",
      TransactionInactiveError: "TransactionInactiveError",
      ReadOnlyError: "ReadOnlyError",
      VersionError: "VersionError",
      OperationError: "OperationError",
      NotAllowedError: "NotAllowedError",
      OptOutError: "OptOutError"
    });
    var DOMExceptionNames = Object.keys(DOMExceptionName);
    function isValidDomExceptionCode(value) {
      return typeof value === "number" && value >= 1 && value <= 25;
    }
    function endsWithError(value) {
      return typeof value === "string" && value.substring(value.length - DOMExceptionName.Error.length) === DOMExceptionName.Error;
    }
    function DOMException(messageOrCode, nameOrMessage) {
      if (isValidDomExceptionCode(messageOrCode)) {
        this.name = DOMExceptionNames[messageOrCode];
        this.message = nameOrMessage || "";
      } else {
        this.message = messageOrCode;
        this.name = endsWithError(nameOrMessage) ? nameOrMessage : DOMExceptionName.Error;
      }
      if (Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
    }
    extendError(DOMException, true);
    Object.defineProperties(DOMException.prototype, {
      code: {
        enumerable: true,
        get: function() {
          var code = DOMExceptionNames.indexOf(this.name);
          if (isValidDomExceptionCode(code)) return code;
          return 0;
        }
      }
    });
    var ExceptionCode = {
      INDEX_SIZE_ERR: 1,
      DOMSTRING_SIZE_ERR: 2,
      HIERARCHY_REQUEST_ERR: 3,
      WRONG_DOCUMENT_ERR: 4,
      INVALID_CHARACTER_ERR: 5,
      NO_DATA_ALLOWED_ERR: 6,
      NO_MODIFICATION_ALLOWED_ERR: 7,
      NOT_FOUND_ERR: 8,
      NOT_SUPPORTED_ERR: 9,
      INUSE_ATTRIBUTE_ERR: 10,
      INVALID_STATE_ERR: 11,
      SYNTAX_ERR: 12,
      INVALID_MODIFICATION_ERR: 13,
      NAMESPACE_ERR: 14,
      INVALID_ACCESS_ERR: 15,
      VALIDATION_ERR: 16,
      TYPE_MISMATCH_ERR: 17,
      SECURITY_ERR: 18,
      NETWORK_ERR: 19,
      ABORT_ERR: 20,
      URL_MISMATCH_ERR: 21,
      QUOTA_EXCEEDED_ERR: 22,
      TIMEOUT_ERR: 23,
      INVALID_NODE_TYPE_ERR: 24,
      DATA_CLONE_ERR: 25
    };
    var entries2 = Object.entries(ExceptionCode);
    for (i = 0; i < entries2.length; i++) {
      key = entries2[i][0];
      DOMException[key] = entries2[i][1];
    }
    var key;
    var i;
    function ParseError(message, locator) {
      this.message = message;
      this.locator = locator;
      if (Error.captureStackTrace) Error.captureStackTrace(this, ParseError);
    }
    extendError(ParseError);
    exports.DOMException = DOMException;
    exports.DOMExceptionName = DOMExceptionName;
    exports.ExceptionCode = ExceptionCode;
    exports.ParseError = ParseError;
  }
});

// node_modules/@xmldom/xmldom/lib/grammar.js
var require_grammar = __commonJS({
  "node_modules/@xmldom/xmldom/lib/grammar.js"(exports) {
    "use strict";
    function detectUnicodeSupport(RegExpImpl) {
      try {
        if (typeof RegExpImpl !== "function") {
          RegExpImpl = RegExp;
        }
        var match = new RegExpImpl("\u{1D306}", "u").exec("\u{1D306}");
        return !!match && match[0].length === 2;
      } catch (error) {
      }
      return false;
    }
    var UNICODE_SUPPORT = detectUnicodeSupport();
    function chars(regexp) {
      if (regexp.source[0] !== "[") {
        throw new Error(regexp + " can not be used with chars");
      }
      return regexp.source.slice(1, regexp.source.lastIndexOf("]"));
    }
    function chars_without(regexp, search) {
      if (regexp.source[0] !== "[") {
        throw new Error("/" + regexp.source + "/ can not be used with chars_without");
      }
      if (!search || typeof search !== "string") {
        throw new Error(JSON.stringify(search) + " is not a valid search");
      }
      if (regexp.source.indexOf(search) === -1) {
        throw new Error('"' + search + '" is not is /' + regexp.source + "/");
      }
      if (search === "-" && regexp.source.indexOf(search) !== 1) {
        throw new Error('"' + search + '" is not at the first postion of /' + regexp.source + "/");
      }
      return new RegExp(regexp.source.replace(search, ""), UNICODE_SUPPORT ? "u" : "");
    }
    function reg(args) {
      var self = this;
      return new RegExp(
        Array.prototype.slice.call(arguments).map(function(part) {
          var isStr = typeof part === "string";
          if (isStr && self === void 0 && part === "|") {
            throw new Error("use regg instead of reg to wrap expressions with `|`!");
          }
          return isStr ? part : part.source;
        }).join(""),
        UNICODE_SUPPORT ? "mu" : "m"
      );
    }
    function regg(args) {
      if (arguments.length === 0) {
        throw new Error("no parameters provided");
      }
      return reg.apply(regg, ["(?:"].concat(Array.prototype.slice.call(arguments), [")"]));
    }
    var UNICODE_REPLACEMENT_CHARACTER = "\uFFFD";
    var Char = /[-\x09\x0A\x0D\x20-\x2C\x2E-\uD7FF\uE000-\uFFFD]/;
    if (UNICODE_SUPPORT) {
      Char = reg("[", chars(Char), "\\u{10000}-\\u{10FFFF}", "]");
    }
    var InvalidChar = new RegExp("[^" + chars(Char) + "]", UNICODE_SUPPORT ? "u" : "");
    var _SChar = /[\x20\x09\x0D\x0A]/;
    var SChar_s = chars(_SChar);
    var S = reg(_SChar, "+");
    var S_OPT = reg(_SChar, "*");
    var NameStartChar = /[:_a-zA-Z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
    if (UNICODE_SUPPORT) {
      NameStartChar = reg("[", chars(NameStartChar), "\\u{10000}-\\u{10FFFF}", "]");
    }
    var NameStartChar_s = chars(NameStartChar);
    var NameChar = reg("[", NameStartChar_s, chars(/[-.0-9\xB7]/), chars(/[\u0300-\u036F\u203F-\u2040]/), "]");
    var Name = reg(NameStartChar, NameChar, "*");
    var Nmtoken = reg(NameChar, "+");
    var EntityRef = reg("&", Name, ";");
    var CharRef = regg(/&#[0-9]+;|&#x[0-9a-fA-F]+;/);
    var Reference = regg(EntityRef, "|", CharRef);
    var PEReference = reg("%", Name, ";");
    var EntityValue = regg(
      reg('"', regg(/[^%&"]/, "|", PEReference, "|", Reference), "*", '"'),
      "|",
      reg("'", regg(/[^%&']/, "|", PEReference, "|", Reference), "*", "'")
    );
    var AttValue = regg('"', regg(/[^<&"]/, "|", Reference), "*", '"', "|", "'", regg(/[^<&']/, "|", Reference), "*", "'");
    var NCNameStartChar = chars_without(NameStartChar, ":");
    var NCNameChar = chars_without(NameChar, ":");
    var NCName = reg(NCNameStartChar, NCNameChar, "*");
    var QName = reg(NCName, regg(":", NCName), "?");
    var QName_exact = reg("^", QName, "$");
    var QName_group = reg("(", QName, ")");
    var SystemLiteral = regg(/"[^"]*"|'[^']*'/);
    var PI = reg(/^<\?/, "(", Name, ")", regg(S, "(?!", _SChar, ")(", Char, "*?)"), "?", /\?>/);
    var PubidChar = /[\x20\x0D\x0Aa-zA-Z0-9-'()+,./:=?;!*#@$_%]/;
    var PubidLiteral = regg('"', PubidChar, '*"', "|", "'", chars_without(PubidChar, "'"), "*'");
    var COMMENT_START = "<!--";
    var COMMENT_END = "-->";
    var Comment = reg(COMMENT_START, regg(chars_without(Char, "-"), "|", reg("-", chars_without(Char, "-"))), "*", COMMENT_END);
    var PCDATA = "#PCDATA";
    var Mixed = regg(
      reg(/\(/, S_OPT, PCDATA, regg(S_OPT, /\|/, S_OPT, QName), "*", S_OPT, /\)\*/),
      "|",
      reg(/\(/, S_OPT, PCDATA, S_OPT, /\)/)
    );
    var _children_quantity = /[?*+]?/;
    var children = reg(
      /\([^>]+\)/,
      _children_quantity
      /*regg(choice, '|', seq), _children_quantity*/
    );
    var contentspec = regg("EMPTY", "|", "ANY", "|", Mixed, "|", children);
    var ELEMENTDECL_START = "<!ELEMENT";
    var elementdecl = reg(ELEMENTDECL_START, S, regg(QName, "|", PEReference), S, regg(contentspec, "|", PEReference), S_OPT, ">");
    var NotationType = reg("NOTATION", S, /\(/, S_OPT, Name, regg(S_OPT, /\|/, S_OPT, Name), "*", S_OPT, /\)/);
    var Enumeration = reg(/\(/, S_OPT, Nmtoken, regg(S_OPT, /\|/, S_OPT, Nmtoken), "*", S_OPT, /\)/);
    var EnumeratedType = regg(NotationType, "|", Enumeration);
    var AttType = regg(/CDATA|ID|IDREF|IDREFS|ENTITY|ENTITIES|NMTOKEN|NMTOKENS/, "|", EnumeratedType);
    var DefaultDecl = regg(/#REQUIRED|#IMPLIED/, "|", regg(regg("#FIXED", S), "?", AttValue));
    var AttDef = regg(S, Name, S, AttType, S, DefaultDecl);
    var ATTLIST_DECL_START = "<!ATTLIST";
    var AttlistDecl = reg(ATTLIST_DECL_START, S, Name, AttDef, "*", S_OPT, ">");
    var ABOUT_LEGACY_COMPAT = "about:legacy-compat";
    var ABOUT_LEGACY_COMPAT_SystemLiteral = regg('"' + ABOUT_LEGACY_COMPAT + '"', "|", "'" + ABOUT_LEGACY_COMPAT + "'");
    var SYSTEM = "SYSTEM";
    var PUBLIC = "PUBLIC";
    var ExternalID = regg(regg(SYSTEM, S, SystemLiteral), "|", regg(PUBLIC, S, PubidLiteral, S, SystemLiteral));
    var ExternalID_match = reg(
      "^",
      regg(
        regg(SYSTEM, S, "(?<SystemLiteralOnly>", SystemLiteral, ")"),
        "|",
        regg(PUBLIC, S, "(?<PubidLiteral>", PubidLiteral, ")", S, "(?<SystemLiteral>", SystemLiteral, ")")
      )
    );
    var PubidLiteral_match = reg("^", PubidLiteral, "$");
    var SystemLiteral_match = reg("^", SystemLiteral, "$");
    var NDataDecl = regg(S, "NDATA", S, Name);
    var EntityDef = regg(EntityValue, "|", regg(ExternalID, NDataDecl, "?"));
    var ENTITY_DECL_START = "<!ENTITY";
    var GEDecl = reg(ENTITY_DECL_START, S, Name, S, EntityDef, S_OPT, ">");
    var PEDef = regg(EntityValue, "|", ExternalID);
    var PEDecl = reg(ENTITY_DECL_START, S, "%", S, Name, S, PEDef, S_OPT, ">");
    var EntityDecl = regg(GEDecl, "|", PEDecl);
    var PublicID = reg(PUBLIC, S, PubidLiteral);
    var NotationDecl = reg("<!NOTATION", S, Name, S, regg(ExternalID, "|", PublicID), S_OPT, ">");
    var Eq = reg(S_OPT, "=", S_OPT);
    var VersionNum = /1[.]\d+/;
    var VersionInfo = reg(S, "version", Eq, regg("'", VersionNum, "'", "|", '"', VersionNum, '"'));
    var EncName = /[A-Za-z][-A-Za-z0-9._]*/;
    var EncodingDecl = regg(S, "encoding", Eq, regg('"', EncName, '"', "|", "'", EncName, "'"));
    var SDDecl = regg(S, "standalone", Eq, regg("'", regg("yes", "|", "no"), "'", "|", '"', regg("yes", "|", "no"), '"'));
    var XMLDecl = reg(/^<\?xml/, VersionInfo, EncodingDecl, "?", SDDecl, "?", S_OPT, /\?>/);
    var DOCTYPE_DECL_START = "<!DOCTYPE";
    var CDATA_START = "<![CDATA[";
    var CDATA_END = "]]>";
    var CDStart = /<!\[CDATA\[/;
    var CDEnd = /\]\]>/;
    var CData = reg(Char, "*?", CDEnd);
    var CDSect = reg(CDStart, CData);
    exports.chars = chars;
    exports.chars_without = chars_without;
    exports.detectUnicodeSupport = detectUnicodeSupport;
    exports.reg = reg;
    exports.regg = regg;
    exports.ABOUT_LEGACY_COMPAT = ABOUT_LEGACY_COMPAT;
    exports.ABOUT_LEGACY_COMPAT_SystemLiteral = ABOUT_LEGACY_COMPAT_SystemLiteral;
    exports.AttlistDecl = AttlistDecl;
    exports.CDATA_START = CDATA_START;
    exports.CDATA_END = CDATA_END;
    exports.CDSect = CDSect;
    exports.Char = Char;
    exports.Comment = Comment;
    exports.COMMENT_START = COMMENT_START;
    exports.COMMENT_END = COMMENT_END;
    exports.DOCTYPE_DECL_START = DOCTYPE_DECL_START;
    exports.elementdecl = elementdecl;
    exports.EntityDecl = EntityDecl;
    exports.EntityValue = EntityValue;
    exports.ExternalID = ExternalID;
    exports.ExternalID_match = ExternalID_match;
    exports.Name = Name;
    exports.NotationDecl = NotationDecl;
    exports.Reference = Reference;
    exports.PEReference = PEReference;
    exports.PI = PI;
    exports.PUBLIC = PUBLIC;
    exports.PubidLiteral = PubidLiteral;
    exports.PubidLiteral_match = PubidLiteral_match;
    exports.QName = QName;
    exports.QName_exact = QName_exact;
    exports.QName_group = QName_group;
    exports.S = S;
    exports.SChar_s = SChar_s;
    exports.S_OPT = S_OPT;
    exports.SYSTEM = SYSTEM;
    exports.SystemLiteral = SystemLiteral;
    exports.SystemLiteral_match = SystemLiteral_match;
    exports.InvalidChar = InvalidChar;
    exports.UNICODE_REPLACEMENT_CHARACTER = UNICODE_REPLACEMENT_CHARACTER;
    exports.UNICODE_SUPPORT = UNICODE_SUPPORT;
    exports.XMLDecl = XMLDecl;
  }
});

// node_modules/@xmldom/xmldom/lib/dom.js
var require_dom = __commonJS({
  "node_modules/@xmldom/xmldom/lib/dom.js"(exports) {
    "use strict";
    var conventions = require_conventions();
    var find = conventions.find;
    var hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
    var hasOwn = conventions.hasOwn;
    var isHTMLMimeType = conventions.isHTMLMimeType;
    var isHTMLRawTextElement = conventions.isHTMLRawTextElement;
    var isHTMLVoidElement = conventions.isHTMLVoidElement;
    var MIME_TYPE = conventions.MIME_TYPE;
    var NAMESPACE = conventions.NAMESPACE;
    var PDC = /* @__PURE__ */ Symbol();
    var errors = require_errors();
    var DOMException = errors.DOMException;
    var DOMExceptionName = errors.DOMExceptionName;
    var g = require_grammar();
    function checkSymbol(symbol) {
      if (symbol !== PDC) {
        throw new TypeError("Illegal constructor");
      }
    }
    function notEmptyString(input) {
      return input !== "";
    }
    function splitOnASCIIWhitespace(input) {
      return input ? input.split(/[\t\n\f\r ]+/).filter(notEmptyString) : [];
    }
    function orderedSetReducer(current, element) {
      if (!hasOwn(current, element)) {
        current[element] = true;
      }
      return current;
    }
    function toOrderedSet(input) {
      if (!input) return [];
      var list = splitOnASCIIWhitespace(input);
      return Object.keys(list.reduce(orderedSetReducer, {}));
    }
    function arrayIncludes(list) {
      return function(element) {
        return list && list.indexOf(element) !== -1;
      };
    }
    function validateQualifiedName(qualifiedName) {
      if (!g.QName_exact.test(qualifiedName)) {
        throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'invalid character in qualified name "' + qualifiedName + '"');
      }
    }
    function validateAndExtract(namespace, qualifiedName) {
      validateQualifiedName(qualifiedName);
      namespace = namespace || null;
      var prefix = null;
      var localName = qualifiedName;
      if (qualifiedName.indexOf(":") >= 0) {
        var splitResult = qualifiedName.split(":");
        prefix = splitResult[0];
        localName = splitResult[1];
      }
      if (prefix !== null && namespace === null) {
        throw new DOMException(DOMException.NAMESPACE_ERR, "prefix is non-null and namespace is null");
      }
      if (prefix === "xml" && namespace !== conventions.NAMESPACE.XML) {
        throw new DOMException(DOMException.NAMESPACE_ERR, 'prefix is "xml" and namespace is not the XML namespace');
      }
      if ((prefix === "xmlns" || qualifiedName === "xmlns") && namespace !== conventions.NAMESPACE.XMLNS) {
        throw new DOMException(
          DOMException.NAMESPACE_ERR,
          'either qualifiedName or prefix is "xmlns" and namespace is not the XMLNS namespace'
        );
      }
      if (namespace === conventions.NAMESPACE.XMLNS && prefix !== "xmlns" && qualifiedName !== "xmlns") {
        throw new DOMException(
          DOMException.NAMESPACE_ERR,
          'namespace is the XMLNS namespace and neither qualifiedName nor prefix is "xmlns"'
        );
      }
      return [namespace, prefix, localName];
    }
    function copy(src, dest) {
      for (var p in src) {
        if (hasOwn(src, p)) {
          dest[p] = src[p];
        }
      }
    }
    function _extends(Class, Super) {
      var pt = Class.prototype;
      if (!(pt instanceof Super)) {
        let t = function() {
        };
        t.prototype = Super.prototype;
        t = new t();
        copy(pt, t);
        Class.prototype = pt = t;
      }
      if (pt.constructor != Class) {
        if (typeof Class != "function") {
          console.error("unknown Class:" + Class);
        }
        pt.constructor = Class;
      }
    }
    var NodeType = {};
    var ELEMENT_NODE = NodeType.ELEMENT_NODE = 1;
    var ATTRIBUTE_NODE = NodeType.ATTRIBUTE_NODE = 2;
    var TEXT_NODE = NodeType.TEXT_NODE = 3;
    var CDATA_SECTION_NODE = NodeType.CDATA_SECTION_NODE = 4;
    var ENTITY_REFERENCE_NODE = NodeType.ENTITY_REFERENCE_NODE = 5;
    var ENTITY_NODE = NodeType.ENTITY_NODE = 6;
    var PROCESSING_INSTRUCTION_NODE = NodeType.PROCESSING_INSTRUCTION_NODE = 7;
    var COMMENT_NODE = NodeType.COMMENT_NODE = 8;
    var DOCUMENT_NODE = NodeType.DOCUMENT_NODE = 9;
    var DOCUMENT_TYPE_NODE = NodeType.DOCUMENT_TYPE_NODE = 10;
    var DOCUMENT_FRAGMENT_NODE = NodeType.DOCUMENT_FRAGMENT_NODE = 11;
    var NOTATION_NODE = NodeType.NOTATION_NODE = 12;
    var DocumentPosition = conventions.freeze({
      DOCUMENT_POSITION_DISCONNECTED: 1,
      DOCUMENT_POSITION_PRECEDING: 2,
      DOCUMENT_POSITION_FOLLOWING: 4,
      DOCUMENT_POSITION_CONTAINS: 8,
      DOCUMENT_POSITION_CONTAINED_BY: 16,
      DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32
    });
    function commonAncestor(a, b) {
      if (b.length < a.length) return commonAncestor(b, a);
      var c = null;
      for (var n in a) {
        if (a[n] !== b[n]) return c;
        c = a[n];
      }
      return c;
    }
    function docGUID(doc) {
      if (!doc.guid) doc.guid = Math.random();
      return doc.guid;
    }
    function NodeList() {
    }
    NodeList.prototype = {
      /**
       * The number of nodes in the list. The range of valid child node indices is 0 to length-1
       * inclusive.
       *
       * @type {number}
       */
      length: 0,
      /**
       * Returns the item at `index`. If index is greater than or equal to the number of nodes in
       * the list, this returns null.
       *
       * @param index
       * Unsigned long Index into the collection.
       * @returns {Node | null}
       * The node at position `index` in the NodeList,
       * or null if that is not a valid index.
       */
      item: function(index) {
        return index >= 0 && index < this.length ? this[index] : null;
      },
      /**
       * Returns a string representation of the NodeList.
       *
       * Accepts the same `options` object as `XMLSerializer.prototype.serializeToString`
       * (`requireWellFormed`, `splitCDATASections`, `nodeFilter`). Passing a function is treated as
       * a legacy `nodeFilter` for backward compatibility.
       *
       * @param {Object | function} [options]
       * @param {boolean} [options.requireWellFormed=false]
       * @param {boolean} [options.splitCDATASections=true]
       * @param {function} [options.nodeFilter]
       * @returns {string}
       */
      toString: function(options) {
        var opts;
        if (typeof options === "function") {
          opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: options };
        } else if (!!options) {
          opts = {
            requireWellFormed: !!options.requireWellFormed,
            splitCDATASections: options.splitCDATASections !== false,
            nodeFilter: options.nodeFilter || null
          };
        } else {
          opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: null };
        }
        for (var buf = [], i = 0; i < this.length; i++) {
          serializeToString(this[i], buf, null, opts);
        }
        return buf.join("");
      },
      /**
       * Filters the NodeList based on a predicate.
       *
       * @param {function(Node): boolean} predicate
       * - A predicate function to filter the NodeList.
       * @returns {Node[]}
       * An array of nodes that satisfy the predicate.
       * @private
       */
      filter: function(predicate) {
        return Array.prototype.filter.call(this, predicate);
      },
      /**
       * Returns the first index at which a given node can be found in the NodeList, or -1 if it is
       * not present.
       *
       * @param {Node} item
       * - The Node item to locate in the NodeList.
       * @returns {number}
       * The first index of the node in the NodeList; -1 if not found.
       * @private
       */
      indexOf: function(item) {
        return Array.prototype.indexOf.call(this, item);
      }
    };
    NodeList.prototype[Symbol.iterator] = function() {
      var me = this;
      var index = 0;
      return {
        next: function() {
          if (index < me.length) {
            return {
              value: me[index++],
              done: false
            };
          } else {
            return {
              done: true
            };
          }
        },
        return: function() {
          return {
            done: true
          };
        }
      };
    };
    function LiveNodeList(node, refresh) {
      this._node = node;
      this._refresh = refresh;
      _updateLiveList(this);
    }
    function _updateLiveList(list) {
      var inc = list._node._inc || list._node.ownerDocument._inc;
      if (list._inc !== inc) {
        var ls = list._refresh(list._node);
        __set__(list, "length", ls.length);
        if (!list.$$length || ls.length < list.$$length) {
          for (var i = ls.length; i in list; i++) {
            if (hasOwn(list, i)) {
              delete list[i];
            }
          }
        }
        copy(ls, list);
        list._inc = inc;
      }
    }
    LiveNodeList.prototype.item = function(i) {
      _updateLiveList(this);
      return this[i] || null;
    };
    _extends(LiveNodeList, NodeList);
    function NamedNodeMap() {
    }
    function _findNodeIndex(list, node) {
      var i = 0;
      while (i < list.length) {
        if (list[i] === node) {
          return i;
        }
        i++;
      }
    }
    function _addNamedNode(el, list, newAttr, oldAttr) {
      if (oldAttr) {
        list[_findNodeIndex(list, oldAttr)] = newAttr;
      } else {
        list[list.length] = newAttr;
        list.length++;
      }
      if (el) {
        newAttr.ownerElement = el;
        var doc = el.ownerDocument;
        if (doc) {
          oldAttr && _onRemoveAttribute(doc, el, oldAttr);
          _onAddAttribute(doc, el, newAttr);
        }
      }
    }
    function _removeNamedNode(el, list, attr) {
      var i = _findNodeIndex(list, attr);
      if (i >= 0) {
        var lastIndex = list.length - 1;
        while (i <= lastIndex) {
          list[i] = list[++i];
        }
        list.length = lastIndex;
        if (el) {
          var doc = el.ownerDocument;
          if (doc) {
            _onRemoveAttribute(doc, el, attr);
          }
          attr.ownerElement = null;
        }
      }
    }
    NamedNodeMap.prototype = {
      length: 0,
      item: NodeList.prototype.item,
      /**
       * Get an attribute by name. Note: Name is in lower case in case of HTML namespace and
       * document.
       *
       * @param {string} localName
       * The local name of the attribute.
       * @returns {Attr | null}
       * The attribute with the given local name, or null if no such attribute exists.
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name
       */
      getNamedItem: function(localName) {
        if (this._ownerElement && this._ownerElement._isInHTMLDocumentAndNamespace()) {
          localName = localName.toLowerCase();
        }
        var i = 0;
        while (i < this.length) {
          var attr = this[i];
          if (attr.nodeName === localName) {
            return attr;
          }
          i++;
        }
        return null;
      },
      /**
       * Set an attribute.
       *
       * @param {Attr} attr
       * The attribute to set.
       * @returns {Attr | null}
       * The old attribute with the same local name and namespace URI as the new one, or null if no
       * such attribute exists.
       * @throws {DOMException}
       * With code:
       * - {@link INUSE_ATTRIBUTE_ERR} - If the attribute is already an attribute of another
       * element.
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
       */
      setNamedItem: function(attr) {
        var el = attr.ownerElement;
        if (el && el !== this._ownerElement) {
          throw new DOMException(DOMException.INUSE_ATTRIBUTE_ERR);
        }
        var oldAttr = this.getNamedItemNS(attr.namespaceURI, attr.localName);
        if (oldAttr === attr) {
          return attr;
        }
        _addNamedNode(this._ownerElement, this, attr, oldAttr);
        return oldAttr;
      },
      /**
       * Set an attribute, replacing an existing attribute with the same local name and namespace
       * URI if one exists.
       *
       * @param {Attr} attr
       * The attribute to set.
       * @returns {Attr | null}
       * The old attribute with the same local name and namespace URI as the new one, or null if no
       * such attribute exists.
       * @throws {DOMException}
       * Throws a DOMException with the name "InUseAttributeError" if the attribute is already an
       * attribute of another element.
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
       */
      setNamedItemNS: function(attr) {
        return this.setNamedItem(attr);
      },
      /**
       * Removes an attribute specified by the local name.
       *
       * @param {string} localName
       * The local name of the attribute to be removed.
       * @returns {Attr}
       * The attribute node that was removed.
       * @throws {DOMException}
       * With code:
       * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given name is found.
       * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditem
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-name
       */
      removeNamedItem: function(localName) {
        var attr = this.getNamedItem(localName);
        if (!attr) {
          throw new DOMException(DOMException.NOT_FOUND_ERR, localName);
        }
        _removeNamedNode(this._ownerElement, this, attr);
        return attr;
      },
      /**
       * Removes an attribute specified by the namespace and local name.
       *
       * @param {string | null} namespaceURI
       * The namespace URI of the attribute to be removed.
       * @param {string} localName
       * The local name of the attribute to be removed.
       * @returns {Attr}
       * The attribute node that was removed.
       * @throws {DOMException}
       * With code:
       * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given namespace URI and local
       * name is found.
       * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditemns
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-namespace
       */
      removeNamedItemNS: function(namespaceURI, localName) {
        var attr = this.getNamedItemNS(namespaceURI, localName);
        if (!attr) {
          throw new DOMException(DOMException.NOT_FOUND_ERR, namespaceURI ? namespaceURI + " : " + localName : localName);
        }
        _removeNamedNode(this._ownerElement, this, attr);
        return attr;
      },
      /**
       * Get an attribute by namespace and local name.
       *
       * @param {string | null} namespaceURI
       * The namespace URI of the attribute.
       * @param {string} localName
       * The local name of the attribute.
       * @returns {Attr | null}
       * The attribute with the given namespace URI and local name, or null if no such attribute
       * exists.
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-namespace
       */
      getNamedItemNS: function(namespaceURI, localName) {
        if (!namespaceURI) {
          namespaceURI = null;
        }
        var i = 0;
        while (i < this.length) {
          var node = this[i];
          if (node.localName === localName && node.namespaceURI === namespaceURI) {
            return node;
          }
          i++;
        }
        return null;
      }
    };
    NamedNodeMap.prototype[Symbol.iterator] = function() {
      var me = this;
      var index = 0;
      return {
        next: function() {
          if (index < me.length) {
            return {
              value: me[index++],
              done: false
            };
          } else {
            return {
              done: true
            };
          }
        },
        return: function() {
          return {
            done: true
          };
        }
      };
    };
    function DOMImplementation() {
    }
    DOMImplementation.prototype = {
      /**
       * Test if the DOM implementation implements a specific feature and version, as specified in
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/core.html#DOMFeatures DOM Features}.
       *
       * The DOMImplementation.hasFeature() method returns a Boolean flag indicating if a given
       * feature is supported. The different implementations fairly diverged in what kind of
       * features were reported. The latest version of the spec settled to force this method to
       * always return true, where the functionality was accurate and in use.
       *
       * @deprecated
       * It is deprecated and modern browsers return true in all cases.
       * @function DOMImplementation#hasFeature
       * @param {string} feature
       * The name of the feature to test.
       * @param {string} [version]
       * This is the version number of the feature to test.
       * @returns {boolean}
       * Always returns true.
       * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/hasFeature MDN
       * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-5CED94D7 DOM Level 1 Core
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-hasfeature DOM Living Standard
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-5CED94D7 DOM Level 3 Core
       */
      hasFeature: function(feature, version) {
        return true;
      },
      /**
       * Creates a DOM Document object of the specified type with its document element. Note that
       * based on the {@link DocumentType}
       * given to create the document, the implementation may instantiate specialized
       * {@link Document} objects that support additional features than the "Core", such as "HTML"
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML}.
       * On the other hand, setting the {@link DocumentType} after the document was created makes
       * this very unlikely to happen. Alternatively, specialized {@link Document} creation methods,
       * such as createHTMLDocument
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML},
       * can be used to obtain specific types of {@link Document} objects.
       *
       * __It behaves slightly different from the description in the living standard__:
       * - There is no interface/class `XMLDocument`, it returns a `Document`
       * instance (with it's `type` set to `'xml'`).
       * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
       *
       * @function DOMImplementation.createDocument
       * @param {string | null} namespaceURI
       * The
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-namespaceURI namespace URI}
       * of the document element to create or null.
       * @param {string | null} qualifiedName
       * The
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified name}
       * of the document element to be created or null.
       * @param {DocumentType | null} [doctype=null]
       * The type of document to be created or null. When doctype is not null, its
       * {@link Node#ownerDocument} attribute is set to the document being created. Default is
       * `null`
       * @returns {Document}
       * A new {@link Document} object with its document element. If the NamespaceURI,
       * qualifiedName, and doctype are null, the returned {@link Document} is empty with no
       * document element.
       * @throws {DOMException}
       * With code:
       *
       * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
       * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
       * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed, if the qualifiedName has a
       * prefix and the namespaceURI is null, or if the qualifiedName is null and the namespaceURI
       * is different from null, or if the qualifiedName has a prefix that is "xml" and the
       * namespaceURI is different from "{@link http://www.w3.org/XML/1998/namespace}"
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#Namespaces XML Namespaces},
       * or if the DOM implementation does not support the "XML" feature but a non-null namespace
       * URI was provided, since namespaces were defined by XML.
       * - `WRONG_DOCUMENT_ERR`: Raised if doctype has already been used with a different document
       * or was created from a different implementation.
       * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
       * "XML" and the language exposed through the Document does not support XML Namespaces (such
       * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
       * @since DOM Level 2.
       * @see {@link #createHTMLDocument}
       * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocument MDN
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument DOM Living Standard
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-2-Core-DOM-createDocument DOM
       *      Level 3 Core
       * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocument DOM
       *      Level 2 Core (initial)
       */
      createDocument: function(namespaceURI, qualifiedName, doctype) {
        var contentType = MIME_TYPE.XML_APPLICATION;
        if (namespaceURI === NAMESPACE.HTML) {
          contentType = MIME_TYPE.XML_XHTML_APPLICATION;
        } else if (namespaceURI === NAMESPACE.SVG) {
          contentType = MIME_TYPE.XML_SVG_IMAGE;
        }
        var doc = new Document(PDC, { contentType });
        doc.implementation = this;
        doc.childNodes = new NodeList();
        doc.doctype = doctype || null;
        if (doctype) {
          doc.appendChild(doctype);
        }
        if (qualifiedName) {
          var root = doc.createElementNS(namespaceURI, qualifiedName);
          doc.appendChild(root);
        }
        return doc;
      },
      /**
       * Creates an empty DocumentType node. Entity declarations and notations are not made
       * available. Entity reference expansions and default attribute additions do not occur.
       *
       * **This behavior is slightly different from the one in the specs**:
       * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
       * - `publicId` and `systemId` contain the raw data including any possible quotes,
       *   so they can always be serialized back to the original value
       * - `internalSubset` contains the raw string between `[` and `]` if present,
       *   but is not parsed or validated in any form.
       *
       * @function DOMImplementation#createDocumentType
       * @param {string} qualifiedName
       * The {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified
       * name} of the document type to be created.
       * @param {string} [publicId]
       * The external subset public identifier. Stored verbatim including surrounding quotes.
       * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
       * if the value is non-empty and does not match the XML `PubidLiteral` production
       * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [12]). Creation-time validation is not
       * enforced — deferred to a future breaking release.
       * @param {string} [systemId]
       * The external subset system identifier. Stored verbatim including surrounding quotes.
       * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
       * if the value is non-empty and does not match the XML `SystemLiteral` production
       * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [11]). Creation-time validation is not
       * enforced — deferred to a future breaking release.
       * @param {string} [internalSubset]
       * The internal subset or an empty string if it is not present. Stored verbatim.
       * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
       * if the value contains `"]>"`. Creation-time validation is not enforced.
       * @returns {DocumentType}
       * A new {@link DocumentType} node with {@link Node#ownerDocument} set to null.
       * @throws {DOMException}
       * With code:
       *
       * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
       * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
       * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed.
       * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
       * "XML" and the language exposed through the Document does not support XML Namespaces (such
       * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
       * @since DOM Level 2.
       * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocumentType
       *      MDN
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype DOM Living
       *      Standard
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-3-Core-DOM-createDocType DOM
       *      Level 3 Core
       * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocType DOM
       *      Level 2 Core
       * @see https://github.com/xmldom/xmldom/blob/master/CHANGELOG.md#050
       * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-Core-DocType-internalSubset
       * @prettierignore
       */
      createDocumentType: function(qualifiedName, publicId, systemId, internalSubset) {
        validateQualifiedName(qualifiedName);
        var node = new DocumentType(PDC);
        node.name = qualifiedName;
        node.nodeName = qualifiedName;
        node.publicId = publicId || "";
        node.systemId = systemId || "";
        node.internalSubset = internalSubset || "";
        node.childNodes = new NodeList();
        return node;
      },
      /**
       * Returns an HTML document, that might already have a basic DOM structure.
       *
       * __It behaves slightly different from the description in the living standard__:
       * - If the first argument is `false` no initial nodes are added (steps 3-7 in the specs are
       * omitted)
       * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
       *
       * @param {string | false} [title]
       * A string containing the title to give the new HTML document.
       * @returns {Document}
       * The HTML document.
       * @since WHATWG Living Standard.
       * @see {@link #createDocument}
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-createhtmldocument
       * @see https://dom.spec.whatwg.org/#html-document
       */
      createHTMLDocument: function(title) {
        var doc = new Document(PDC, { contentType: MIME_TYPE.HTML });
        doc.implementation = this;
        doc.childNodes = new NodeList();
        if (title !== false) {
          doc.doctype = this.createDocumentType("html");
          doc.doctype.ownerDocument = doc;
          doc.appendChild(doc.doctype);
          var htmlNode = doc.createElement("html");
          doc.appendChild(htmlNode);
          var headNode = doc.createElement("head");
          htmlNode.appendChild(headNode);
          if (typeof title === "string") {
            var titleNode = doc.createElement("title");
            titleNode.appendChild(doc.createTextNode(title));
            headNode.appendChild(titleNode);
          }
          htmlNode.appendChild(doc.createElement("body"));
        }
        return doc;
      }
    };
    function Node(symbol) {
      checkSymbol(symbol);
    }
    Node.prototype = {
      /**
       * The first child of this node.
       *
       * @type {Node | null}
       */
      firstChild: null,
      /**
       * The last child of this node.
       *
       * @type {Node | null}
       */
      lastChild: null,
      /**
       * The previous sibling of this node.
       *
       * @type {Node | null}
       */
      previousSibling: null,
      /**
       * The next sibling of this node.
       *
       * @type {Node | null}
       */
      nextSibling: null,
      /**
       * The parent node of this node.
       *
       * @type {Node | null}
       */
      parentNode: null,
      /**
       * The parent element of this node.
       *
       * @type {Element | null}
       */
      get parentElement() {
        return this.parentNode && this.parentNode.nodeType === this.ELEMENT_NODE ? this.parentNode : null;
      },
      /**
       * The child nodes of this node.
       *
       * @type {NodeList}
       */
      childNodes: null,
      /**
       * The document object associated with this node.
       *
       * @type {Document | null}
       */
      ownerDocument: null,
      /**
       * The value of this node.
       *
       * @type {string | null}
       */
      nodeValue: null,
      /**
       * The namespace URI of this node.
       *
       * @type {string | null}
       */
      namespaceURI: null,
      /**
       * The prefix of the namespace for this node.
       *
       * @type {string | null}
       */
      prefix: null,
      /**
       * The local part of the qualified name of this node.
       *
       * @type {string | null}
       */
      localName: null,
      /**
       * The baseURI is currently always `about:blank`,
       * since that's what happens when you create a document from scratch.
       *
       * @type {'about:blank'}
       */
      baseURI: "about:blank",
      /**
       * Is true if this node is part of a document.
       *
       * @type {boolean}
       */
      get isConnected() {
        var rootNode = this.getRootNode();
        return rootNode && rootNode.nodeType === rootNode.DOCUMENT_NODE;
      },
      /**
       * Checks whether `other` is an inclusive descendant of this node.
       *
       * @param {Node | null | undefined} other
       * The node to check.
       * @returns {boolean}
       * True if `other` is an inclusive descendant of this node; false otherwise.
       * @see https://dom.spec.whatwg.org/#dom-node-contains
       */
      contains: function(other) {
        if (!other) return false;
        var parent = other;
        do {
          if (this === parent) return true;
          parent = parent.parentNode;
        } while (parent);
        return false;
      },
      /**
       * @typedef GetRootNodeOptions
       * @property {boolean} [composed=false]
       */
      /**
       * Searches for the root node of this node.
       *
       * **This behavior is slightly different from the in the specs**:
       * - ignores `options.composed`, since `ShadowRoot`s are unsupported, always returns root.
       *
       * @param {GetRootNodeOptions} [options]
       * @returns {Node}
       * Root node.
       * @see https://dom.spec.whatwg.org/#dom-node-getrootnode
       * @see https://dom.spec.whatwg.org/#concept-shadow-including-root
       */
      getRootNode: function(options) {
        var parent = this;
        do {
          if (!parent.parentNode) {
            return parent;
          }
          parent = parent.parentNode;
        } while (parent);
      },
      /**
       * Checks whether the given node is equal to this node.
       *
       * Two nodes are equal when they have the same type, defining characteristics (for the type),
       * and the same childNodes. The comparison is iterative to avoid stack overflows on
       * deeply-nested trees. Attribute nodes of each Element pair are also pushed onto the stack
       * and compared the same way.
       *
       * @param {Node} [otherNode]
       * @returns {boolean}
       * @see https://dom.spec.whatwg.org/#concept-node-equals
       * @see ../docs/walk-dom.md.
       */
      isEqualNode: function(otherNode) {
        if (!otherNode) return false;
        var stack = [{ node: this, other: otherNode }];
        while (stack.length > 0) {
          var pair = stack.pop();
          var node = pair.node;
          var other = pair.other;
          if (node.nodeType !== other.nodeType) return false;
          switch (node.nodeType) {
            case node.DOCUMENT_TYPE_NODE:
              if (node.name !== other.name) return false;
              if (node.publicId !== other.publicId) return false;
              if (node.systemId !== other.systemId) return false;
              break;
            case node.ELEMENT_NODE:
              if (node.namespaceURI !== other.namespaceURI) return false;
              if (node.prefix !== other.prefix) return false;
              if (node.localName !== other.localName) return false;
              if (node.attributes.length !== other.attributes.length) return false;
              for (var i = 0; i < node.attributes.length; i++) {
                var attr = node.attributes.item(i);
                var otherAttr = other.getAttributeNodeNS(attr.namespaceURI, attr.localName);
                if (!otherAttr) return false;
                stack.push({ node: attr, other: otherAttr });
              }
              break;
            case node.ATTRIBUTE_NODE:
              if (node.namespaceURI !== other.namespaceURI) return false;
              if (node.localName !== other.localName) return false;
              if (node.value !== other.value) return false;
              break;
            case node.PROCESSING_INSTRUCTION_NODE:
              if (node.target !== other.target || node.data !== other.data) return false;
              break;
            case node.TEXT_NODE:
            case node.CDATA_SECTION_NODE:
            case node.COMMENT_NODE:
              if (node.data !== other.data) return false;
              break;
          }
          if (node.childNodes.length !== other.childNodes.length) return false;
          for (var i = node.childNodes.length - 1; i >= 0; i--) {
            stack.push({ node: node.childNodes[i], other: other.childNodes[i] });
          }
        }
        return true;
      },
      /**
       * Checks whether or not the given node is this node.
       *
       * @param {Node} [otherNode]
       */
      isSameNode: function(otherNode) {
        return this === otherNode;
      },
      /**
       * Inserts a node before a reference node as a child of this node.
       *
       * @param {Node} newChild
       * The new child node to be inserted.
       * @param {Node | null} refChild
       * The reference node before which newChild will be inserted.
       * @returns {Node}
       * The new child node successfully inserted.
       * @throws {DOMException}
       * Throws a DOMException if inserting the node would result in a DOM tree that is not
       * well-formed, or if `child` is provided but is not a child of `parent`.
       * See {@link _insertBefore} for more details.
       * @since Modified in DOM L2
       */
      insertBefore: function(newChild, refChild) {
        return _insertBefore(this, newChild, refChild);
      },
      /**
       * Replaces an old child node with a new child node within this node.
       *
       * @param {Node} newChild
       * The new node that is to replace the old node.
       * If it already exists in the DOM, it is removed from its original position.
       * @param {Node} oldChild
       * The existing child node to be replaced.
       * @returns {Node}
       * Returns the replaced child node.
       * @throws {DOMException}
       * Throws a DOMException if replacing the node would result in a DOM tree that is not
       * well-formed, or if `oldChild` is not a child of `this`.
       * This can also occur if the pre-replacement validity assertion fails.
       * See {@link _insertBefore}, {@link Node.removeChild}, and
       * {@link assertPreReplacementValidityInDocument} for more details.
       * @see https://dom.spec.whatwg.org/#concept-node-replace
       */
      replaceChild: function(newChild, oldChild) {
        _insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
        if (oldChild) {
          this.removeChild(oldChild);
        }
      },
      /**
       * Removes an existing child node from this node.
       *
       * @param {Node} oldChild
       * The child node to be removed.
       * @returns {Node}
       * Returns the removed child node.
       * @throws {DOMException}
       * Throws a DOMException if `oldChild` is not a child of `this`.
       * See {@link _removeChild} for more details.
       */
      removeChild: function(oldChild) {
        return _removeChild(this, oldChild);
      },
      /**
       * Appends a child node to this node.
       *
       * @param {Node} newChild
       * The child node to be appended to this node.
       * If it already exists in the DOM, it is removed from its original position.
       * @returns {Node}
       * Returns the appended child node.
       * @throws {DOMException}
       * Throws a DOMException if appending the node would result in a DOM tree that is not
       * well-formed, or if `newChild` is not a valid Node.
       * See {@link insertBefore} for more details.
       */
      appendChild: function(newChild) {
        return this.insertBefore(newChild, null);
      },
      /**
       * Determines whether this node has any child nodes.
       *
       * @returns {boolean}
       * Returns true if this node has any child nodes, and false otherwise.
       */
      hasChildNodes: function() {
        return this.firstChild != null;
      },
      /**
       * Creates a copy of the calling node.
       *
       * @param {boolean} deep
       * If true, the contents of the node are recursively copied.
       * If false, only the node itself (and its attributes, if it is an element) are copied.
       * @returns {Node}
       * Returns the newly created copy of the node.
       * @throws {DOMException}
       * May throw a DOMException if operations within {@link Element#setAttributeNode} or
       * {@link Node#appendChild} (which are potentially invoked in this method) do not meet their
       * specific constraints.
       * @see {@link cloneNode}
       */
      cloneNode: function(deep) {
        return cloneNode(this.ownerDocument || this, this, deep);
      },
      /**
       * Puts the specified node and all of its subtree into a "normalized" form. In a normalized
       * subtree, no text nodes in the subtree are empty and there are no adjacent text nodes.
       *
       * Specifically, this method merges any adjacent text nodes (i.e., nodes for which `nodeType`
       * is `TEXT_NODE`) into a single node with the combined data. It also removes any empty text
       * nodes.
       *
       * This method iterativly traverses all child nodes to normalize all descendent nodes within
       * the subtree.
       *
       * @throws {DOMException}
       * May throw a DOMException if operations within removeChild or appendData (which are
       * potentially invoked in this method) do not meet their specific constraints.
       * @since Modified in DOM Level 2
       * @see {@link Node.removeChild}
       * @see {@link CharacterData.appendData}
       * @see ../docs/walk-dom.md.
       */
      normalize: function() {
        walkDOM(this, null, {
          enter: function(node) {
            var child = node.firstChild;
            while (child) {
              var next = child.nextSibling;
              if (next !== null && next.nodeType === TEXT_NODE && child.nodeType === TEXT_NODE) {
                node.removeChild(next);
                child.appendData(next.data);
              } else {
                child = next;
              }
            }
            return true;
          }
        });
      },
      /**
       * Checks whether the DOM implementation implements a specific feature and its version.
       *
       * @deprecated
       * Since `DOMImplementation.hasFeature` is deprecated and always returns true.
       * @param {string} feature
       * The package name of the feature to test. This is the same name that can be passed to the
       * method `hasFeature` on `DOMImplementation`.
       * @param {string} version
       * This is the version number of the package name to test.
       * @returns {boolean}
       * Returns true in all cases in the current implementation.
       * @since Introduced in DOM Level 2
       * @see {@link DOMImplementation.hasFeature}
       */
      isSupported: function(feature, version) {
        return this.ownerDocument.implementation.hasFeature(feature, version);
      },
      /**
       * Look up the prefix associated to the given namespace URI, starting from this node.
       * **The default namespace declarations are ignored by this method.**
       * See Namespace Prefix Lookup for details on the algorithm used by this method.
       *
       * **This behavior is different from the in the specs**:
       * - no node type specific handling
       * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
       *
       * @param {string | null} namespaceURI
       * The namespace URI for which to find the associated prefix.
       * @returns {string | null}
       * The associated prefix, if found; otherwise, null.
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespacePrefix
       * @see https://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespacePrefixAlgo
       * @see https://dom.spec.whatwg.org/#dom-node-lookupprefix
       * @see https://github.com/xmldom/xmldom/issues/322
       * @prettierignore
       */
      lookupPrefix: function(namespaceURI) {
        var el = this;
        while (el) {
          var map = el._nsMap;
          if (map) {
            for (var n in map) {
              if (hasOwn(map, n) && map[n] === namespaceURI) {
                return n;
              }
            }
          }
          el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
        }
        return null;
      },
      /**
       * This function is used to look up the namespace URI associated with the given prefix,
       * starting from this node.
       *
       * **This behavior is different from the in the specs**:
       * - no node type specific handling
       * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
       *
       * @param {string | null} prefix
       * The prefix for which to find the associated namespace URI.
       * @returns {string | null}
       * The associated namespace URI, if found; otherwise, null.
       * @since DOM Level 3
       * @see https://dom.spec.whatwg.org/#dom-node-lookupnamespaceuri
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespaceURI
       * @prettierignore
       */
      lookupNamespaceURI: function(prefix) {
        var el = this;
        while (el) {
          var map = el._nsMap;
          if (map) {
            if (hasOwn(map, prefix)) {
              return map[prefix];
            }
          }
          el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
        }
        return null;
      },
      /**
       * Determines whether the given namespace URI is the default namespace.
       *
       * The function works by looking up the prefix associated with the given namespace URI. If no
       * prefix is found (i.e., the namespace URI is not registered in the namespace map of this
       * node or any of its ancestors), it returns `true`, implying the namespace URI is considered
       * the default.
       *
       * **This behavior is different from the in the specs**:
       * - no node type specific handling
       * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
       *
       * @param {string | null} namespaceURI
       * The namespace URI to be checked.
       * @returns {boolean}
       * Returns true if the given namespace URI is the default namespace, false otherwise.
       * @since DOM Level 3
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-isDefaultNamespace
       * @see https://dom.spec.whatwg.org/#dom-node-isdefaultnamespace
       * @prettierignore
       */
      isDefaultNamespace: function(namespaceURI) {
        var prefix = this.lookupPrefix(namespaceURI);
        return prefix == null;
      },
      /**
       * Compares the reference node with a node with regard to their position in the document and
       * according to the document order.
       *
       * @param {Node} other
       * The node to compare the reference node to.
       * @returns {number}
       * Returns how the node is positioned relatively to the reference node according to the
       * bitmask. 0 if reference node and given node are the same.
       * @since DOM Level 3
       * @see https://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-compare
       * @see https://dom.spec.whatwg.org/#dom-node-comparedocumentposition
       */
      compareDocumentPosition: function(other) {
        if (this === other) return 0;
        var node1 = other;
        var node2 = this;
        var attr1 = null;
        var attr2 = null;
        if (node1 instanceof Attr) {
          attr1 = node1;
          node1 = attr1.ownerElement;
        }
        if (node2 instanceof Attr) {
          attr2 = node2;
          node2 = attr2.ownerElement;
          if (attr1 && node1 && node2 === node1) {
            for (var i = 0, attr; attr = node2.attributes[i]; i++) {
              if (attr === attr1)
                return DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
              if (attr === attr2)
                return DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
            }
          }
        }
        if (!node1 || !node2 || node2.ownerDocument !== node1.ownerDocument) {
          return DocumentPosition.DOCUMENT_POSITION_DISCONNECTED + DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + (docGUID(node2.ownerDocument) > docGUID(node1.ownerDocument) ? DocumentPosition.DOCUMENT_POSITION_FOLLOWING : DocumentPosition.DOCUMENT_POSITION_PRECEDING);
        }
        if (attr2 && node1 === node2) {
          return DocumentPosition.DOCUMENT_POSITION_CONTAINS + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
        }
        if (attr1 && node1 === node2) {
          return DocumentPosition.DOCUMENT_POSITION_CONTAINED_BY + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
        }
        var chain1 = [];
        var ancestor1 = node1.parentNode;
        while (ancestor1) {
          if (!attr2 && ancestor1 === node2) {
            return DocumentPosition.DOCUMENT_POSITION_CONTAINED_BY + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
          }
          chain1.push(ancestor1);
          ancestor1 = ancestor1.parentNode;
        }
        chain1.reverse();
        var chain2 = [];
        var ancestor2 = node2.parentNode;
        while (ancestor2) {
          if (!attr1 && ancestor2 === node1) {
            return DocumentPosition.DOCUMENT_POSITION_CONTAINS + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
          }
          chain2.push(ancestor2);
          ancestor2 = ancestor2.parentNode;
        }
        chain2.reverse();
        var ca = commonAncestor(chain1, chain2);
        for (var n in ca.childNodes) {
          var child = ca.childNodes[n];
          if (child === node2) return DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
          if (child === node1) return DocumentPosition.DOCUMENT_POSITION_PRECEDING;
          if (chain2.indexOf(child) >= 0) return DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
          if (chain1.indexOf(child) >= 0) return DocumentPosition.DOCUMENT_POSITION_PRECEDING;
        }
        return 0;
      }
    };
    function _xmlEncoder(c) {
      return c == "<" && "&lt;" || c == ">" && "&gt;" || c == "&" && "&amp;" || c == '"' && "&quot;" || "&#" + c.charCodeAt() + ";";
    }
    copy(NodeType, Node);
    copy(NodeType, Node.prototype);
    copy(DocumentPosition, Node);
    copy(DocumentPosition, Node.prototype);
    function _visitNode(node, callback) {
      walkDOM(node, null, {
        enter: function(n) {
          return callback(n) ? walkDOM.STOP : true;
        }
      });
    }
    function walkDOM(node, context, callbacks) {
      var stack = [{ node, context, phase: walkDOM.ENTER }];
      while (stack.length > 0) {
        var frame = stack.pop();
        if (frame.phase === walkDOM.ENTER) {
          var childContext = callbacks.enter(frame.node, frame.context);
          if (childContext === walkDOM.STOP) {
            return walkDOM.STOP;
          }
          stack.push({ node: frame.node, context: childContext, phase: walkDOM.EXIT });
          if (childContext === null || childContext === void 0) {
            continue;
          }
          var child = frame.node.lastChild;
          while (child) {
            stack.push({ node: child, context: childContext, phase: walkDOM.ENTER });
            child = child.previousSibling;
          }
        } else {
          if (callbacks.exit) {
            callbacks.exit(frame.node, frame.context);
          }
        }
      }
    }
    walkDOM.STOP = /* @__PURE__ */ Symbol("walkDOM.STOP");
    walkDOM.ENTER = 0;
    walkDOM.EXIT = 1;
    function Document(symbol, options) {
      checkSymbol(symbol);
      var opt = options || {};
      this.ownerDocument = this;
      this.contentType = opt.contentType || MIME_TYPE.XML_APPLICATION;
      this.type = isHTMLMimeType(this.contentType) ? "html" : "xml";
    }
    function _onAddAttribute(doc, el, newAttr) {
      doc && doc._inc++;
      var ns = newAttr.namespaceURI;
      if (ns === NAMESPACE.XMLNS) {
        el._nsMap[newAttr.prefix ? newAttr.localName : ""] = newAttr.value;
      }
    }
    function _onRemoveAttribute(doc, el, newAttr, remove) {
      doc && doc._inc++;
      var ns = newAttr.namespaceURI;
      if (ns === NAMESPACE.XMLNS) {
        delete el._nsMap[newAttr.prefix ? newAttr.localName : ""];
      }
    }
    function _onUpdateChild(doc, parent, newChild) {
      if (doc && doc._inc) {
        doc._inc++;
        var childNodes = parent.childNodes;
        if (newChild && !newChild.nextSibling) {
          childNodes[childNodes.length++] = newChild;
        } else {
          var child = parent.firstChild;
          var i = 0;
          while (child) {
            childNodes[i++] = child;
            child = child.nextSibling;
          }
          childNodes.length = i;
          delete childNodes[childNodes.length];
        }
      }
    }
    function _removeChild(parentNode, child) {
      if (parentNode !== child.parentNode) {
        throw new DOMException(DOMException.NOT_FOUND_ERR, "child's parent is not parent");
      }
      var oldPreviousSibling = child.previousSibling;
      var oldNextSibling = child.nextSibling;
      if (oldPreviousSibling) {
        oldPreviousSibling.nextSibling = oldNextSibling;
      } else {
        parentNode.firstChild = oldNextSibling;
      }
      if (oldNextSibling) {
        oldNextSibling.previousSibling = oldPreviousSibling;
      } else {
        parentNode.lastChild = oldPreviousSibling;
      }
      _onUpdateChild(parentNode.ownerDocument, parentNode);
      child.parentNode = null;
      child.previousSibling = null;
      child.nextSibling = null;
      return child;
    }
    function hasValidParentNodeType(node) {
      return node && (node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.ELEMENT_NODE);
    }
    function hasInsertableNodeType(node) {
      return node && (node.nodeType === Node.CDATA_SECTION_NODE || node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.DOCUMENT_TYPE_NODE || node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.PROCESSING_INSTRUCTION_NODE || node.nodeType === Node.TEXT_NODE);
    }
    function isDocTypeNode(node) {
      return node && node.nodeType === Node.DOCUMENT_TYPE_NODE;
    }
    function isElementNode(node) {
      return node && node.nodeType === Node.ELEMENT_NODE;
    }
    function isTextNode(node) {
      return node && node.nodeType === Node.TEXT_NODE;
    }
    function isElementInsertionPossible(doc, child) {
      var parentChildNodes = doc.childNodes || [];
      if (find(parentChildNodes, isElementNode) || isDocTypeNode(child)) {
        return false;
      }
      var docTypeNode = find(parentChildNodes, isDocTypeNode);
      return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
    }
    function isElementReplacementPossible(doc, child) {
      var parentChildNodes = doc.childNodes || [];
      function hasElementChildThatIsNotChild(node) {
        return isElementNode(node) && node !== child;
      }
      if (find(parentChildNodes, hasElementChildThatIsNotChild)) {
        return false;
      }
      var docTypeNode = find(parentChildNodes, isDocTypeNode);
      return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
    }
    function assertPreInsertionValidity1to5(parent, node, child) {
      if (!hasValidParentNodeType(parent)) {
        throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Unexpected parent node type " + parent.nodeType);
      }
      if (child && child.parentNode !== parent) {
        throw new DOMException(DOMException.NOT_FOUND_ERR, "child not in parent");
      }
      if (
        // 4. If `node` is not a DocumentFragment, DocumentType, Element, or CharacterData node, then throw a "HierarchyRequestError" DOMException.
        !hasInsertableNodeType(node) || // 5. If either `node` is a Text node and `parent` is a document,
        // the sax parser currently adds top level text nodes, this will be fixed in 0.9.0
        // || (node.nodeType === Node.TEXT_NODE && parent.nodeType === Node.DOCUMENT_NODE)
        // or `node` is a doctype and `parent` is not a document, then throw a "HierarchyRequestError" DOMException.
        isDocTypeNode(node) && parent.nodeType !== Node.DOCUMENT_NODE
      ) {
        throw new DOMException(
          DOMException.HIERARCHY_REQUEST_ERR,
          "Unexpected node type " + node.nodeType + " for parent node type " + parent.nodeType
        );
      }
    }
    function assertPreInsertionValidityInDocument(parent, node, child) {
      var parentChildNodes = parent.childNodes || [];
      var nodeChildNodes = node.childNodes || [];
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        var nodeChildElements = nodeChildNodes.filter(isElementNode);
        if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
        }
        if (nodeChildElements.length === 1 && !isElementInsertionPossible(parent, child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
        }
      }
      if (isElementNode(node)) {
        if (!isElementInsertionPossible(parent, child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
        }
      }
      if (isDocTypeNode(node)) {
        if (find(parentChildNodes, isDocTypeNode)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
        }
        var parentElementChild = find(parentChildNodes, isElementNode);
        if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
        }
        if (!child && parentElementChild) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can not be appended since element is present");
        }
      }
    }
    function assertPreReplacementValidityInDocument(parent, node, child) {
      var parentChildNodes = parent.childNodes || [];
      var nodeChildNodes = node.childNodes || [];
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        var nodeChildElements = nodeChildNodes.filter(isElementNode);
        if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
        }
        if (nodeChildElements.length === 1 && !isElementReplacementPossible(parent, child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
        }
      }
      if (isElementNode(node)) {
        if (!isElementReplacementPossible(parent, child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
        }
      }
      if (isDocTypeNode(node)) {
        let hasDoctypeChildThatIsNotChild = function(node2) {
          return isDocTypeNode(node2) && node2 !== child;
        };
        if (find(parentChildNodes, hasDoctypeChildThatIsNotChild)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
        }
        var parentElementChild = find(parentChildNodes, isElementNode);
        if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
        }
      }
    }
    function _insertBefore(parent, node, child, _inDocumentAssertion) {
      assertPreInsertionValidity1to5(parent, node, child);
      if (parent.nodeType === Node.DOCUMENT_NODE) {
        (_inDocumentAssertion || assertPreInsertionValidityInDocument)(parent, node, child);
      }
      var cp = node.parentNode;
      if (cp) {
        cp.removeChild(node);
      }
      if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
        var newFirst = node.firstChild;
        if (newFirst == null) {
          return node;
        }
        var newLast = node.lastChild;
      } else {
        newFirst = newLast = node;
      }
      var pre = child ? child.previousSibling : parent.lastChild;
      newFirst.previousSibling = pre;
      newLast.nextSibling = child;
      if (pre) {
        pre.nextSibling = newFirst;
      } else {
        parent.firstChild = newFirst;
      }
      if (child == null) {
        parent.lastChild = newLast;
      } else {
        child.previousSibling = newLast;
      }
      do {
        newFirst.parentNode = parent;
      } while (newFirst !== newLast && (newFirst = newFirst.nextSibling));
      _onUpdateChild(parent.ownerDocument || parent, parent, node);
      if (node.nodeType == DOCUMENT_FRAGMENT_NODE) {
        node.firstChild = node.lastChild = null;
      }
      return node;
    }
    Document.prototype = {
      /**
       * The implementation that created this document.
       *
       * @type DOMImplementation
       * @readonly
       */
      implementation: null,
      nodeName: "#document",
      nodeType: DOCUMENT_NODE,
      /**
       * The DocumentType node of the document.
       *
       * @type DocumentType
       * @readonly
       */
      doctype: null,
      documentElement: null,
      _inc: 1,
      insertBefore: function(newChild, refChild) {
        if (newChild.nodeType === DOCUMENT_FRAGMENT_NODE) {
          var child = newChild.firstChild;
          while (child) {
            var next = child.nextSibling;
            this.insertBefore(child, refChild);
            child = next;
          }
          return newChild;
        }
        _insertBefore(this, newChild, refChild);
        newChild.ownerDocument = this;
        if (this.documentElement === null && newChild.nodeType === ELEMENT_NODE) {
          this.documentElement = newChild;
        }
        return newChild;
      },
      removeChild: function(oldChild) {
        var removed = _removeChild(this, oldChild);
        if (removed === this.documentElement) {
          this.documentElement = null;
        }
        return removed;
      },
      replaceChild: function(newChild, oldChild) {
        _insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
        newChild.ownerDocument = this;
        if (oldChild) {
          this.removeChild(oldChild);
        }
        if (isElementNode(newChild)) {
          this.documentElement = newChild;
        }
      },
      /**
       * Imports a node from another document into this document, creating a new copy owned by this
       * document. The source node and its subtree are not modified.
       *
       * @param {Node} importedNode
       * The node to import.
       * @param {boolean} deep
       * If true, the contents of the node are recursively imported.
       * If false, only the node itself (and its attributes, if it is an element) are imported.
       * @returns {Node}
       * Returns the newly created import of the node.
       * @see {@link importNode}
       * @see {@link https://dom.spec.whatwg.org/#dom-document-importnode}
       */
      importNode: function(importedNode, deep) {
        return importNode(this, importedNode, deep);
      },
      // Introduced in DOM Level 2:
      getElementById: function(id) {
        var rtv = null;
        _visitNode(this.documentElement, function(node) {
          if (node.nodeType == ELEMENT_NODE) {
            if (node.getAttribute("id") == id) {
              rtv = node;
              return true;
            }
          }
        });
        return rtv;
      },
      /**
       * Creates a new `Element` that is owned by this `Document`.
       * In HTML Documents `localName` is the lower cased `tagName`,
       * otherwise no transformation is being applied.
       * When `contentType` implies the HTML namespace, it will be set as `namespaceURI`.
       *
       * __This implementation differs from the specification:__ - The provided name is not checked
       * against the `Name` production,
       * so no related error will be thrown.
       * - There is no interface `HTMLElement`, it is always an `Element`.
       * - There is no support for a second argument to indicate using custom elements.
       *
       * @param {string} tagName
       * @returns {Element}
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement
       * @see https://dom.spec.whatwg.org/#dom-document-createelement
       * @see https://dom.spec.whatwg.org/#concept-create-element
       */
      createElement: function(tagName) {
        var node = new Element(PDC);
        node.ownerDocument = this;
        if (this.type === "html") {
          tagName = tagName.toLowerCase();
        }
        if (hasDefaultHTMLNamespace(this.contentType)) {
          node.namespaceURI = NAMESPACE.HTML;
        }
        node.nodeName = tagName;
        node.tagName = tagName;
        node.localName = tagName;
        node.childNodes = new NodeList();
        var attrs = node.attributes = new NamedNodeMap();
        attrs._ownerElement = node;
        return node;
      },
      /**
       * @returns {DocumentFragment}
       */
      createDocumentFragment: function() {
        var node = new DocumentFragment(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        return node;
      },
      /**
       * @param {string} data
       * @returns {Text}
       */
      createTextNode: function(data) {
        var node = new Text(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.appendData(data);
        return node;
      },
      /**
       * @param {string} data
       * @returns {Comment}
       * @see https://dom.spec.whatwg.org/#dom-document-createcomment
       * @see https://www.w3.org/TR/xml/#NT-Comment XML 1.0 production [15]
       * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.3
       *
       *      Note: no validation is performed at creation time. When the resulting document is
       *      serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
       *      if the comment data contains `--` anywhere, ends with `-`, or contains characters
       *      outside the XML Char production (W3C DOM Parsing §3.2.1.3). Without that option the
       *      data is emitted verbatim.
       */
      createComment: function(data) {
        var node = new Comment(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.appendData(data);
        return node;
      },
      /**
       * Returns a new CDATASection node whose data is `data`.
       *
       * __This implementation differs from the specification:__ - calling this method on an HTML
       * document does not throw `NotSupportedError`.
       *
       * @param {string} data
       * @returns {CDATASection}
       * @throws {DOMException}
       * With code `INVALID_CHARACTER_ERR` if `data` contains `"]]>"`.
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createCDATASection
       * @see https://dom.spec.whatwg.org/#dom-document-createcdatasection
       */
      createCDATASection: function(data) {
        if (data.indexOf("]]>") !== -1) {
          throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'data contains "]]>"');
        }
        var node = new CDATASection(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.appendData(data);
        return node;
      },
      /**
       * Returns a ProcessingInstruction node whose target is target and data is data.
       *
       * __This behavior is slightly different from the in the specs__:
       * - it does not do any input validation on the arguments and doesn't throw
       * "InvalidCharacterError".
       *
       * Note: When the resulting document is serialized with `requireWellFormed: true`, the
       * serializer throws `InvalidStateError` if `.target` contains `:` or is an ASCII
       * case-insensitive match for `"xml"`, or if `.data` contains `?>` or characters outside the
       * XML Char production (W3C DOM Parsing §3.2.1.7). Without that option the data is emitted
       * verbatim.
       *
       * @param {string} target
       * @param {string} data
       * @returns {ProcessingInstruction}
       * @see https://developer.mozilla.org/docs/Web/API/Document/createProcessingInstruction
       * @see https://dom.spec.whatwg.org/#dom-document-createprocessinginstruction
       * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.7
       */
      createProcessingInstruction: function(target2, data) {
        var node = new ProcessingInstruction(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.nodeName = node.target = target2;
        node.nodeValue = node.data = data;
        return node;
      },
      /**
       * Creates an `Attr` node that is owned by this document.
       * In HTML Documents `localName` is the lower cased `name`,
       * otherwise no transformation is being applied.
       *
       * __This implementation differs from the specification:__ - The provided name is not checked
       * against the `Name` production,
       * so no related error will be thrown.
       *
       * @param {string} name
       * @returns {Attr}
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createAttribute
       * @see https://dom.spec.whatwg.org/#dom-document-createattribute
       */
      createAttribute: function(name) {
        if (!g.QName_exact.test(name)) {
          throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'invalid character in name "' + name + '"');
        }
        if (this.type === "html") {
          name = name.toLowerCase();
        }
        return this._createAttribute(name);
      },
      _createAttribute: function(name) {
        var node = new Attr(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.name = name;
        node.nodeName = name;
        node.localName = name;
        node.specified = true;
        return node;
      },
      /**
       * Creates an EntityReference object.
       * The current implementation does not fill the `childNodes` with those of the corresponding
       * `Entity`
       *
       * @deprecated
       * In DOM Level 4.
       * @param {string} name
       * The name of the entity to reference. No namespace well-formedness checks are performed.
       * @returns {EntityReference}
       * @throws {DOMException}
       * With code `INVALID_CHARACTER_ERR` when `name` is not valid.
       * @throws {DOMException}
       * with code `NOT_SUPPORTED_ERR` when the document is of type `html`
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-392B75AE
       */
      createEntityReference: function(name) {
        if (!g.Name.test(name)) {
          throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'not a valid xml name "' + name + '"');
        }
        if (this.type === "html") {
          throw new DOMException("document is an html document", DOMExceptionName.NotSupportedError);
        }
        var node = new EntityReference(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.nodeName = name;
        return node;
      },
      // Introduced in DOM Level 2:
      /**
       * @param {string} namespaceURI
       * @param {string} qualifiedName
       * @returns {Element}
       */
      createElementNS: function(namespaceURI, qualifiedName) {
        var validated = validateAndExtract(namespaceURI, qualifiedName);
        var node = new Element(PDC);
        var attrs = node.attributes = new NamedNodeMap();
        node.childNodes = new NodeList();
        node.ownerDocument = this;
        node.nodeName = qualifiedName;
        node.tagName = qualifiedName;
        node.namespaceURI = validated[0];
        node.prefix = validated[1];
        node.localName = validated[2];
        attrs._ownerElement = node;
        return node;
      },
      // Introduced in DOM Level 2:
      /**
       * @param {string} namespaceURI
       * @param {string} qualifiedName
       * @returns {Attr}
       */
      createAttributeNS: function(namespaceURI, qualifiedName) {
        var validated = validateAndExtract(namespaceURI, qualifiedName);
        var node = new Attr(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.nodeName = qualifiedName;
        node.name = qualifiedName;
        node.specified = true;
        node.namespaceURI = validated[0];
        node.prefix = validated[1];
        node.localName = validated[2];
        return node;
      }
    };
    _extends(Document, Node);
    function Element(symbol) {
      checkSymbol(symbol);
      this._nsMap = /* @__PURE__ */ Object.create(null);
    }
    Element.prototype = {
      nodeType: ELEMENT_NODE,
      /**
       * The attributes of this element.
       *
       * @type {NamedNodeMap | null}
       */
      attributes: null,
      getQualifiedName: function() {
        return this.prefix ? this.prefix + ":" + this.localName : this.localName;
      },
      _isInHTMLDocumentAndNamespace: function() {
        return this.ownerDocument.type === "html" && this.namespaceURI === NAMESPACE.HTML;
      },
      /**
       * Implementaton of Level2 Core function hasAttributes.
       *
       * @returns {boolean}
       * True if attribute list is not empty.
       * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-NodeHasAttrs
       */
      hasAttributes: function() {
        return !!(this.attributes && this.attributes.length);
      },
      hasAttribute: function(name) {
        return !!this.getAttributeNode(name);
      },
      /**
       * Returns element’s first attribute whose qualified name is `name`, and `null`
       * if there is no such attribute.
       *
       * @param {string} name
       * @returns {string | null}
       */
      getAttribute: function(name) {
        var attr = this.getAttributeNode(name);
        return attr ? attr.value : null;
      },
      getAttributeNode: function(name) {
        if (this._isInHTMLDocumentAndNamespace()) {
          name = name.toLowerCase();
        }
        return this.attributes.getNamedItem(name);
      },
      /**
       * Sets the value of element’s first attribute whose qualified name is qualifiedName to value.
       *
       * @param {string} name
       * @param {string} value
       */
      setAttribute: function(name, value) {
        if (this._isInHTMLDocumentAndNamespace()) {
          name = name.toLowerCase();
        }
        var attr = this.getAttributeNode(name);
        if (attr) {
          attr.value = attr.nodeValue = "" + value;
        } else {
          attr = this.ownerDocument._createAttribute(name);
          attr.value = attr.nodeValue = "" + value;
          this.setAttributeNode(attr);
        }
      },
      removeAttribute: function(name) {
        var attr = this.getAttributeNode(name);
        attr && this.removeAttributeNode(attr);
      },
      setAttributeNode: function(newAttr) {
        return this.attributes.setNamedItem(newAttr);
      },
      setAttributeNodeNS: function(newAttr) {
        return this.attributes.setNamedItemNS(newAttr);
      },
      removeAttributeNode: function(oldAttr) {
        return this.attributes.removeNamedItem(oldAttr.nodeName);
      },
      //get real attribute name,and remove it by removeAttributeNode
      removeAttributeNS: function(namespaceURI, localName) {
        var old = this.getAttributeNodeNS(namespaceURI, localName);
        old && this.removeAttributeNode(old);
      },
      hasAttributeNS: function(namespaceURI, localName) {
        return this.getAttributeNodeNS(namespaceURI, localName) != null;
      },
      /**
       * Returns element’s attribute whose namespace is `namespaceURI` and local name is
       * `localName`,
       * or `null` if there is no such attribute.
       *
       * @param {string} namespaceURI
       * @param {string} localName
       * @returns {string | null}
       */
      getAttributeNS: function(namespaceURI, localName) {
        var attr = this.getAttributeNodeNS(namespaceURI, localName);
        return attr ? attr.value : null;
      },
      /**
       * Sets the value of element’s attribute whose namespace is `namespaceURI` and local name is
       * `localName` to value.
       *
       * @param {string} namespaceURI
       * @param {string} qualifiedName
       * @param {string} value
       * @see https://dom.spec.whatwg.org/#dom-element-setattributens
       */
      setAttributeNS: function(namespaceURI, qualifiedName, value) {
        var validated = validateAndExtract(namespaceURI, qualifiedName);
        var localName = validated[2];
        var attr = this.getAttributeNodeNS(namespaceURI, localName);
        if (attr) {
          attr.value = attr.nodeValue = "" + value;
        } else {
          attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
          attr.value = attr.nodeValue = "" + value;
          this.setAttributeNode(attr);
        }
      },
      getAttributeNodeNS: function(namespaceURI, localName) {
        return this.attributes.getNamedItemNS(namespaceURI, localName);
      },
      /**
       * Returns a LiveNodeList of all child elements which have **all** of the given class name(s).
       *
       * Returns an empty list if `classNames` is an empty string or only contains HTML white space
       * characters.
       *
       * Warning: This returns a live LiveNodeList.
       * Changes in the DOM will reflect in the array as the changes occur.
       * If an element selected by this array no longer qualifies for the selector,
       * it will automatically be removed. Be aware of this for iteration purposes.
       *
       * @param {string} classNames
       * Is a string representing the class name(s) to match; multiple class names are separated by
       * (ASCII-)whitespace.
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByClassName
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
       * @see https://dom.spec.whatwg.org/#concept-getelementsbyclassname
       */
      getElementsByClassName: function(classNames) {
        var classNamesSet = toOrderedSet(classNames);
        return new LiveNodeList(this, function(base) {
          var ls = [];
          if (classNamesSet.length > 0) {
            _visitNode(base, function(node) {
              if (node !== base && node.nodeType === ELEMENT_NODE) {
                var nodeClassNames = node.getAttribute("class");
                if (nodeClassNames) {
                  var matches2 = classNames === nodeClassNames;
                  if (!matches2) {
                    var nodeClassNamesSet = toOrderedSet(nodeClassNames);
                    matches2 = classNamesSet.every(arrayIncludes(nodeClassNamesSet));
                  }
                  if (matches2) {
                    ls.push(node);
                  }
                }
              }
            });
          }
          return ls;
        });
      },
      /**
       * Returns a LiveNodeList of elements with the given qualifiedName.
       * Searching for all descendants can be done by passing `*` as `qualifiedName`.
       *
       * All descendants of the specified element are searched, but not the element itself.
       * The returned list is live, which means it updates itself with the DOM tree automatically.
       * Therefore, there is no need to call `Element.getElementsByTagName()`
       * with the same element and arguments repeatedly if the DOM changes in between calls.
       *
       * When called on an HTML element in an HTML document,
       * `getElementsByTagName` lower-cases the argument before searching for it.
       * This is undesirable when trying to match camel-cased SVG elements (such as
       * `<linearGradient>`) in an HTML document.
       * Instead, use `Element.getElementsByTagNameNS()`,
       * which preserves the capitalization of the tag name.
       *
       * `Element.getElementsByTagName` is similar to `Document.getElementsByTagName()`,
       * except that it only searches for elements that are descendants of the specified element.
       *
       * @param {string} qualifiedName
       * @returns {LiveNodeList}
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
       * @see https://dom.spec.whatwg.org/#concept-getelementsbytagname
       */
      getElementsByTagName: function(qualifiedName) {
        var isHTMLDocument = (this.nodeType === DOCUMENT_NODE ? this : this.ownerDocument).type === "html";
        var lowerQualifiedName = qualifiedName.toLowerCase();
        return new LiveNodeList(this, function(base) {
          var ls = [];
          _visitNode(base, function(node) {
            if (node === base || node.nodeType !== ELEMENT_NODE) {
              return;
            }
            if (qualifiedName === "*") {
              ls.push(node);
            } else {
              var nodeQualifiedName = node.getQualifiedName();
              var matchingQName = isHTMLDocument && node.namespaceURI === NAMESPACE.HTML ? lowerQualifiedName : qualifiedName;
              if (nodeQualifiedName === matchingQName) {
                ls.push(node);
              }
            }
          });
          return ls;
        });
      },
      getElementsByTagNameNS: function(namespaceURI, localName) {
        return new LiveNodeList(this, function(base) {
          var ls = [];
          _visitNode(base, function(node) {
            if (node !== base && node.nodeType === ELEMENT_NODE && (namespaceURI === "*" || node.namespaceURI === namespaceURI) && (localName === "*" || node.localName == localName)) {
              ls.push(node);
            }
          });
          return ls;
        });
      }
    };
    Document.prototype.getElementsByClassName = Element.prototype.getElementsByClassName;
    Document.prototype.getElementsByTagName = Element.prototype.getElementsByTagName;
    Document.prototype.getElementsByTagNameNS = Element.prototype.getElementsByTagNameNS;
    _extends(Element, Node);
    function Attr(symbol) {
      checkSymbol(symbol);
      this.namespaceURI = null;
      this.prefix = null;
      this.ownerElement = null;
    }
    Attr.prototype.nodeType = ATTRIBUTE_NODE;
    _extends(Attr, Node);
    function CharacterData(symbol) {
      checkSymbol(symbol);
    }
    CharacterData.prototype = {
      data: "",
      substringData: function(offset, count2) {
        return this.data.substring(offset, offset + count2);
      },
      appendData: function(text) {
        text = this.data + text;
        this.nodeValue = this.data = text;
        this.length = text.length;
      },
      insertData: function(offset, text) {
        this.replaceData(offset, 0, text);
      },
      deleteData: function(offset, count2) {
        this.replaceData(offset, count2, "");
      },
      replaceData: function(offset, count2, text) {
        var start = this.data.substring(0, offset);
        var end = this.data.substring(offset + count2);
        text = start + text + end;
        this.nodeValue = this.data = text;
        this.length = text.length;
      }
    };
    _extends(CharacterData, Node);
    function Text(symbol) {
      checkSymbol(symbol);
    }
    Text.prototype = {
      nodeName: "#text",
      nodeType: TEXT_NODE,
      splitText: function(offset) {
        var text = this.data;
        var newText = text.substring(offset);
        text = text.substring(0, offset);
        this.data = this.nodeValue = text;
        this.length = text.length;
        var newNode = this.ownerDocument.createTextNode(newText);
        if (this.parentNode) {
          this.parentNode.insertBefore(newNode, this.nextSibling);
        }
        return newNode;
      }
    };
    _extends(Text, CharacterData);
    function Comment(symbol) {
      checkSymbol(symbol);
    }
    Comment.prototype = {
      nodeName: "#comment",
      nodeType: COMMENT_NODE
    };
    _extends(Comment, CharacterData);
    function CDATASection(symbol) {
      checkSymbol(symbol);
    }
    CDATASection.prototype = {
      nodeName: "#cdata-section",
      nodeType: CDATA_SECTION_NODE
    };
    _extends(CDATASection, Text);
    function DocumentType(symbol) {
      checkSymbol(symbol);
    }
    DocumentType.prototype.nodeType = DOCUMENT_TYPE_NODE;
    _extends(DocumentType, Node);
    function Notation(symbol) {
      checkSymbol(symbol);
    }
    Notation.prototype.nodeType = NOTATION_NODE;
    _extends(Notation, Node);
    function Entity(symbol) {
      checkSymbol(symbol);
    }
    Entity.prototype.nodeType = ENTITY_NODE;
    _extends(Entity, Node);
    function EntityReference(symbol) {
      checkSymbol(symbol);
    }
    EntityReference.prototype.nodeType = ENTITY_REFERENCE_NODE;
    _extends(EntityReference, Node);
    function DocumentFragment(symbol) {
      checkSymbol(symbol);
    }
    DocumentFragment.prototype.nodeName = "#document-fragment";
    DocumentFragment.prototype.nodeType = DOCUMENT_FRAGMENT_NODE;
    _extends(DocumentFragment, Node);
    function ProcessingInstruction(symbol) {
      checkSymbol(symbol);
    }
    ProcessingInstruction.prototype.nodeType = PROCESSING_INSTRUCTION_NODE;
    _extends(ProcessingInstruction, CharacterData);
    function XMLSerializer() {
    }
    XMLSerializer.prototype.serializeToString = function(node, options) {
      return nodeSerializeToString.call(node, options);
    };
    Node.prototype.toString = nodeSerializeToString;
    function nodeSerializeToString(options) {
      var opts;
      if (typeof options === "function") {
        opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: options };
      } else if (options != null) {
        opts = {
          requireWellFormed: !!options.requireWellFormed,
          splitCDATASections: options.splitCDATASections !== false,
          nodeFilter: options.nodeFilter || null
        };
      } else {
        opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: null };
      }
      var buf = [];
      var refNode = this.nodeType === DOCUMENT_NODE && this.documentElement || this;
      var prefix = refNode.prefix;
      var uri = refNode.namespaceURI;
      if (uri && prefix == null) {
        var prefix = refNode.lookupPrefix(uri);
        if (prefix == null) {
          var visibleNamespaces = [
            { namespace: uri, prefix: null }
            //{namespace:uri,prefix:''}
          ];
        }
      }
      serializeToString(this, buf, visibleNamespaces, opts);
      return buf.join("");
    }
    function needNamespaceDefine(node, isHTML, visibleNamespaces) {
      var prefix = node.prefix || "";
      var uri = node.namespaceURI;
      if (!uri) {
        return false;
      }
      if (prefix === "xml" && uri === NAMESPACE.XML || uri === NAMESPACE.XMLNS) {
        return false;
      }
      var i = visibleNamespaces.length;
      while (i--) {
        var ns = visibleNamespaces[i];
        if (ns.prefix === prefix) {
          return ns.namespace !== uri;
        }
      }
      return true;
    }
    function addSerializedAttribute(buf, qualifiedName, value, requireWellFormed) {
      if (requireWellFormed && !g.QName_exact.test(qualifiedName)) {
        throw new DOMException(
          'The attribute name "' + qualifiedName + '" is not a valid XML QName',
          DOMExceptionName.InvalidStateError
        );
      }
      buf.push(" ", qualifiedName, '="', value.replace(/[<>&"\t\n\r]/g, _xmlEncoder), '"');
    }
    function serializeToString(node, buf, visibleNamespaces, opts) {
      if (!visibleNamespaces) {
        visibleNamespaces = [];
      }
      var nodeFilter = opts.nodeFilter;
      var requireWellFormed = opts.requireWellFormed;
      var splitCDATASections = opts.splitCDATASections;
      var doc = node.nodeType === DOCUMENT_NODE ? node : node.ownerDocument;
      var isHTML = doc.type === "html";
      walkDOM(
        node,
        { ns: visibleNamespaces },
        {
          enter: function(n, ctx) {
            var namespaces = ctx.ns;
            if (nodeFilter) {
              n = nodeFilter(n);
              if (n) {
                if (typeof n == "string") {
                  buf.push(n);
                  return null;
                }
              } else {
                return null;
              }
            }
            switch (n.nodeType) {
              case ELEMENT_NODE:
                var attrs = n.attributes;
                var len = attrs.length;
                var nodeName = n.tagName;
                var prefixedNodeName = nodeName;
                if (!isHTML && !n.prefix && n.namespaceURI) {
                  var defaultNS;
                  for (var ai = 0; ai < attrs.length; ai++) {
                    if (attrs.item(ai).name === "xmlns") {
                      defaultNS = attrs.item(ai).value;
                      break;
                    }
                  }
                  if (!defaultNS) {
                    for (var nsi = namespaces.length - 1; nsi >= 0; nsi--) {
                      var nsEntry = namespaces[nsi];
                      if (nsEntry.prefix === "" && nsEntry.namespace === n.namespaceURI) {
                        defaultNS = nsEntry.namespace;
                        break;
                      }
                    }
                  }
                  if (defaultNS !== n.namespaceURI) {
                    for (var nsi = namespaces.length - 1; nsi >= 0; nsi--) {
                      var nsEntry = namespaces[nsi];
                      if (nsEntry.namespace === n.namespaceURI) {
                        if (nsEntry.prefix) {
                          prefixedNodeName = nsEntry.prefix + ":" + nodeName;
                        }
                        break;
                      }
                    }
                  }
                }
                if (requireWellFormed && !g.QName_exact.test(prefixedNodeName)) {
                  throw new DOMException(
                    'The element name "' + prefixedNodeName + '" is not a valid XML QName',
                    DOMExceptionName.InvalidStateError
                  );
                }
                buf.push("<", prefixedNodeName);
                var childNamespaces = namespaces.slice();
                for (var i = 0; i < len; i++) {
                  var attr = attrs.item(i);
                  if (attr.prefix == "xmlns") {
                    childNamespaces.push({
                      prefix: attr.localName,
                      namespace: attr.value
                    });
                  } else if (attr.nodeName == "xmlns") {
                    childNamespaces.push({ prefix: "", namespace: attr.value });
                  }
                }
                for (var i = 0; i < len; i++) {
                  var attr = attrs.item(i);
                  if (needNamespaceDefine(attr, isHTML, childNamespaces)) {
                    var attrPrefix = attr.prefix || "";
                    var uri = attr.namespaceURI;
                    addSerializedAttribute(buf, attrPrefix ? "xmlns:" + attrPrefix : "xmlns", uri, requireWellFormed);
                    childNamespaces.push({ prefix: attrPrefix, namespace: uri });
                  }
                  var filteredAttr = nodeFilter ? nodeFilter(attr) : attr;
                  if (filteredAttr) {
                    if (typeof filteredAttr === "string") {
                      buf.push(filteredAttr);
                    } else {
                      addSerializedAttribute(buf, filteredAttr.name, filteredAttr.value, requireWellFormed);
                    }
                  }
                }
                if (nodeName === prefixedNodeName && needNamespaceDefine(n, isHTML, childNamespaces)) {
                  var nodePrefix = n.prefix || "";
                  var uri = n.namespaceURI;
                  addSerializedAttribute(buf, nodePrefix ? "xmlns:" + nodePrefix : "xmlns", uri, requireWellFormed);
                  childNamespaces.push({ prefix: nodePrefix, namespace: uri });
                }
                var canCloseTag = !n.firstChild;
                if (canCloseTag && (isHTML || n.namespaceURI === NAMESPACE.HTML)) {
                  canCloseTag = isHTMLVoidElement(nodeName);
                }
                if (canCloseTag) {
                  buf.push("/>");
                  return null;
                }
                buf.push(">");
                if (isHTML && isHTMLRawTextElement(nodeName)) {
                  var child = n.firstChild;
                  while (child) {
                    if (child.data) {
                      buf.push(child.data);
                    } else {
                      serializeToString(child, buf, childNamespaces.slice(), opts);
                    }
                    child = child.nextSibling;
                  }
                  buf.push("</", prefixedNodeName, ">");
                  return null;
                }
                return { ns: childNamespaces, tag: prefixedNodeName };
              case DOCUMENT_NODE:
              case DOCUMENT_FRAGMENT_NODE:
                if (requireWellFormed && n.nodeType === DOCUMENT_NODE && n.documentElement == null) {
                  throw new DOMException("The Document has no documentElement", DOMExceptionName.InvalidStateError);
                }
                return { ns: namespaces };
              case ATTRIBUTE_NODE:
                addSerializedAttribute(buf, n.name, n.value, requireWellFormed);
                return null;
              case TEXT_NODE:
                if (requireWellFormed && g.InvalidChar.test(n.data)) {
                  throw new DOMException(
                    "The Text node data contains characters outside the XML Char production",
                    DOMExceptionName.InvalidStateError
                  );
                }
                buf.push(n.data.replace(/[<&>]/g, _xmlEncoder));
                return null;
              case CDATA_SECTION_NODE:
                if (requireWellFormed && n.data.indexOf("]]>") !== -1) {
                  throw new DOMException('The CDATASection data contains "]]>"', DOMExceptionName.InvalidStateError);
                }
                if (splitCDATASections) {
                  buf.push(g.CDATA_START, n.data.replace(/]]>/g, "]]]]><![CDATA[>"), g.CDATA_END);
                } else {
                  buf.push(g.CDATA_START, n.data, g.CDATA_END);
                }
                return null;
              case COMMENT_NODE:
                if (requireWellFormed) {
                  if (g.InvalidChar.test(n.data)) {
                    throw new DOMException(
                      "The comment node data contains characters outside the XML Char production",
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  if (n.data.indexOf("--") !== -1 || n.data[n.data.length - 1] === "-") {
                    throw new DOMException(
                      'The comment node data contains "--" or ends with "-"',
                      DOMExceptionName.InvalidStateError
                    );
                  }
                }
                buf.push(g.COMMENT_START, n.data, g.COMMENT_END);
                return null;
              case DOCUMENT_TYPE_NODE:
                var pubid = n.publicId;
                var sysid = n.systemId;
                if (requireWellFormed) {
                  if (pubid && !g.PubidLiteral_match.test(pubid)) {
                    throw new DOMException("DocumentType publicId is not a valid PubidLiteral", DOMExceptionName.InvalidStateError);
                  }
                  if (sysid && sysid !== "." && !g.SystemLiteral_match.test(sysid)) {
                    throw new DOMException("DocumentType systemId is not a valid SystemLiteral", DOMExceptionName.InvalidStateError);
                  }
                  if (n.internalSubset && n.internalSubset.indexOf("]>") !== -1) {
                    throw new DOMException('DocumentType internalSubset contains "]>"', DOMExceptionName.InvalidStateError);
                  }
                }
                buf.push(g.DOCTYPE_DECL_START, " ", n.name);
                if (pubid) {
                  buf.push(" ", g.PUBLIC, " ", pubid);
                  if (sysid && sysid !== ".") {
                    buf.push(" ", sysid);
                  }
                } else if (sysid && sysid !== ".") {
                  buf.push(" ", g.SYSTEM, " ", sysid);
                }
                if (n.internalSubset) {
                  buf.push(" [", n.internalSubset, "]");
                }
                buf.push(">");
                return null;
              case PROCESSING_INSTRUCTION_NODE:
                if (requireWellFormed) {
                  if (n.target.indexOf(":") !== -1 || n.target.toLowerCase() === "xml") {
                    throw new DOMException("The ProcessingInstruction target is not well-formed", DOMExceptionName.InvalidStateError);
                  }
                  if (g.InvalidChar.test(n.data)) {
                    throw new DOMException(
                      "The ProcessingInstruction data contains characters outside the XML Char production",
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  if (n.data.indexOf("?>") !== -1) {
                    throw new DOMException('The ProcessingInstruction data contains "?>"', DOMExceptionName.InvalidStateError);
                  }
                }
                buf.push("<?", n.target, " ", n.data, "?>");
                return null;
              case ENTITY_REFERENCE_NODE:
                buf.push("&", n.nodeName, ";");
                return null;
              //case ENTITY_NODE:
              //case NOTATION_NODE:
              default:
                buf.push("??", n.nodeName);
                return null;
            }
          },
          exit: function(n, childCtx) {
            if (childCtx && childCtx.tag) {
              buf.push("</", childCtx.tag, ">");
            }
          }
        }
      );
    }
    function importNode(doc, node, deep) {
      var destRoot;
      walkDOM(node, null, {
        enter: function(srcNode, destParent) {
          var destNode = srcNode.cloneNode(false);
          destNode.ownerDocument = doc;
          destNode.parentNode = null;
          if (destParent === null) {
            destRoot = destNode;
          } else {
            destParent.appendChild(destNode);
          }
          var shouldDeep = srcNode.nodeType === ATTRIBUTE_NODE || deep;
          return shouldDeep ? destNode : null;
        }
      });
      return destRoot;
    }
    function cloneNode(doc, node, deep) {
      var destRoot;
      walkDOM(node, null, {
        enter: function(srcNode, destParent) {
          var destNode = new srcNode.constructor(PDC);
          for (var n in srcNode) {
            if (hasOwn(srcNode, n)) {
              var v = srcNode[n];
              if (typeof v != "object") {
                if (v != destNode[n]) {
                  destNode[n] = v;
                }
              }
            }
          }
          if (srcNode.childNodes) {
            destNode.childNodes = new NodeList();
          }
          destNode.ownerDocument = doc;
          var shouldDeep = deep;
          switch (destNode.nodeType) {
            case ELEMENT_NODE:
              var attrs = srcNode.attributes;
              var attrs2 = destNode.attributes = new NamedNodeMap();
              var len = attrs.length;
              attrs2._ownerElement = destNode;
              for (var i = 0; i < len; i++) {
                destNode.setAttributeNode(cloneNode(doc, attrs.item(i), true));
              }
              break;
            case ATTRIBUTE_NODE:
              shouldDeep = true;
          }
          if (destParent !== null) {
            destParent.appendChild(destNode);
          } else {
            destRoot = destNode;
          }
          return shouldDeep ? destNode : null;
        }
      });
      return destRoot;
    }
    function __set__(object, key, value) {
      object[key] = value;
    }
    function childrenRefresh(node) {
      var ls = [];
      var child = node.firstChild;
      while (child) {
        if (child.nodeType === ELEMENT_NODE) {
          ls.push(child);
        }
        child = child.nextSibling;
      }
      return ls;
    }
    try {
      if (Object.defineProperty) {
        Object.defineProperty(LiveNodeList.prototype, "length", {
          get: function() {
            _updateLiveList(this);
            return this.$$length;
          }
        });
        Object.defineProperty(Node.prototype, "textContent", {
          get: function() {
            if (this.nodeType === ELEMENT_NODE || this.nodeType === DOCUMENT_FRAGMENT_NODE) {
              var buf = [];
              walkDOM(this, null, {
                enter: function(n) {
                  if (n.nodeType === ELEMENT_NODE || n.nodeType === DOCUMENT_FRAGMENT_NODE) {
                    return true;
                  }
                  if (n.nodeType === PROCESSING_INSTRUCTION_NODE || n.nodeType === COMMENT_NODE) {
                    return null;
                  }
                  buf.push(n.nodeValue);
                }
              });
              return buf.join("");
            }
            return this.nodeValue;
          },
          set: function(data) {
            switch (this.nodeType) {
              case ELEMENT_NODE:
              case DOCUMENT_FRAGMENT_NODE:
                while (this.firstChild) {
                  this.removeChild(this.firstChild);
                }
                if (data || String(data)) {
                  this.appendChild(this.ownerDocument.createTextNode(data));
                }
                break;
              default:
                this.data = data;
                this.value = data;
                this.nodeValue = data;
            }
          }
        });
        Object.defineProperty(CharacterData.prototype, "data", {
          get: function() {
            return this._data != null ? this._data : "";
          },
          set: function(v) {
            this._data = v;
            this.length = typeof v === "string" ? v.length : 0;
          }
        });
        Object.defineProperty(CharacterData.prototype, "nodeValue", {
          get: function() {
            return this.data;
          },
          set: function(v) {
            this.data = v;
          },
          enumerable: true,
          configurable: true
        });
        Object.defineProperty(Element.prototype, "children", {
          get: function() {
            return new LiveNodeList(this, childrenRefresh);
          }
        });
        Object.defineProperty(Document.prototype, "children", {
          get: function() {
            return new LiveNodeList(this, childrenRefresh);
          }
        });
        Object.defineProperty(DocumentFragment.prototype, "children", {
          get: function() {
            return new LiveNodeList(this, childrenRefresh);
          }
        });
        __set__ = function(object, key, value) {
          object["$$" + key] = value;
        };
      }
    } catch (e) {
    }
    exports._updateLiveList = _updateLiveList;
    exports.Attr = Attr;
    exports.CDATASection = CDATASection;
    exports.CharacterData = CharacterData;
    exports.Comment = Comment;
    exports.Document = Document;
    exports.DocumentFragment = DocumentFragment;
    exports.DocumentType = DocumentType;
    exports.DOMImplementation = DOMImplementation;
    exports.Element = Element;
    exports.Entity = Entity;
    exports.EntityReference = EntityReference;
    exports.LiveNodeList = LiveNodeList;
    exports.NamedNodeMap = NamedNodeMap;
    exports.Node = Node;
    exports.NodeList = NodeList;
    exports.Notation = Notation;
    exports.Text = Text;
    exports.ProcessingInstruction = ProcessingInstruction;
    exports.walkDOM = walkDOM;
    exports.XMLSerializer = XMLSerializer;
  }
});

// node_modules/@xmldom/xmldom/lib/entities.js
var require_entities = __commonJS({
  "node_modules/@xmldom/xmldom/lib/entities.js"(exports) {
    "use strict";
    var freeze = require_conventions().freeze;
    exports.XML_ENTITIES = freeze({
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"'
    });
    exports.HTML_ENTITIES = freeze({
      Aacute: "\xC1",
      aacute: "\xE1",
      Abreve: "\u0102",
      abreve: "\u0103",
      ac: "\u223E",
      acd: "\u223F",
      acE: "\u223E\u0333",
      Acirc: "\xC2",
      acirc: "\xE2",
      acute: "\xB4",
      Acy: "\u0410",
      acy: "\u0430",
      AElig: "\xC6",
      aelig: "\xE6",
      af: "\u2061",
      Afr: "\u{1D504}",
      afr: "\u{1D51E}",
      Agrave: "\xC0",
      agrave: "\xE0",
      alefsym: "\u2135",
      aleph: "\u2135",
      Alpha: "\u0391",
      alpha: "\u03B1",
      Amacr: "\u0100",
      amacr: "\u0101",
      amalg: "\u2A3F",
      AMP: "&",
      amp: "&",
      And: "\u2A53",
      and: "\u2227",
      andand: "\u2A55",
      andd: "\u2A5C",
      andslope: "\u2A58",
      andv: "\u2A5A",
      ang: "\u2220",
      ange: "\u29A4",
      angle: "\u2220",
      angmsd: "\u2221",
      angmsdaa: "\u29A8",
      angmsdab: "\u29A9",
      angmsdac: "\u29AA",
      angmsdad: "\u29AB",
      angmsdae: "\u29AC",
      angmsdaf: "\u29AD",
      angmsdag: "\u29AE",
      angmsdah: "\u29AF",
      angrt: "\u221F",
      angrtvb: "\u22BE",
      angrtvbd: "\u299D",
      angsph: "\u2222",
      angst: "\xC5",
      angzarr: "\u237C",
      Aogon: "\u0104",
      aogon: "\u0105",
      Aopf: "\u{1D538}",
      aopf: "\u{1D552}",
      ap: "\u2248",
      apacir: "\u2A6F",
      apE: "\u2A70",
      ape: "\u224A",
      apid: "\u224B",
      apos: "'",
      ApplyFunction: "\u2061",
      approx: "\u2248",
      approxeq: "\u224A",
      Aring: "\xC5",
      aring: "\xE5",
      Ascr: "\u{1D49C}",
      ascr: "\u{1D4B6}",
      Assign: "\u2254",
      ast: "*",
      asymp: "\u2248",
      asympeq: "\u224D",
      Atilde: "\xC3",
      atilde: "\xE3",
      Auml: "\xC4",
      auml: "\xE4",
      awconint: "\u2233",
      awint: "\u2A11",
      backcong: "\u224C",
      backepsilon: "\u03F6",
      backprime: "\u2035",
      backsim: "\u223D",
      backsimeq: "\u22CD",
      Backslash: "\u2216",
      Barv: "\u2AE7",
      barvee: "\u22BD",
      Barwed: "\u2306",
      barwed: "\u2305",
      barwedge: "\u2305",
      bbrk: "\u23B5",
      bbrktbrk: "\u23B6",
      bcong: "\u224C",
      Bcy: "\u0411",
      bcy: "\u0431",
      bdquo: "\u201E",
      becaus: "\u2235",
      Because: "\u2235",
      because: "\u2235",
      bemptyv: "\u29B0",
      bepsi: "\u03F6",
      bernou: "\u212C",
      Bernoullis: "\u212C",
      Beta: "\u0392",
      beta: "\u03B2",
      beth: "\u2136",
      between: "\u226C",
      Bfr: "\u{1D505}",
      bfr: "\u{1D51F}",
      bigcap: "\u22C2",
      bigcirc: "\u25EF",
      bigcup: "\u22C3",
      bigodot: "\u2A00",
      bigoplus: "\u2A01",
      bigotimes: "\u2A02",
      bigsqcup: "\u2A06",
      bigstar: "\u2605",
      bigtriangledown: "\u25BD",
      bigtriangleup: "\u25B3",
      biguplus: "\u2A04",
      bigvee: "\u22C1",
      bigwedge: "\u22C0",
      bkarow: "\u290D",
      blacklozenge: "\u29EB",
      blacksquare: "\u25AA",
      blacktriangle: "\u25B4",
      blacktriangledown: "\u25BE",
      blacktriangleleft: "\u25C2",
      blacktriangleright: "\u25B8",
      blank: "\u2423",
      blk12: "\u2592",
      blk14: "\u2591",
      blk34: "\u2593",
      block: "\u2588",
      bne: "=\u20E5",
      bnequiv: "\u2261\u20E5",
      bNot: "\u2AED",
      bnot: "\u2310",
      Bopf: "\u{1D539}",
      bopf: "\u{1D553}",
      bot: "\u22A5",
      bottom: "\u22A5",
      bowtie: "\u22C8",
      boxbox: "\u29C9",
      boxDL: "\u2557",
      boxDl: "\u2556",
      boxdL: "\u2555",
      boxdl: "\u2510",
      boxDR: "\u2554",
      boxDr: "\u2553",
      boxdR: "\u2552",
      boxdr: "\u250C",
      boxH: "\u2550",
      boxh: "\u2500",
      boxHD: "\u2566",
      boxHd: "\u2564",
      boxhD: "\u2565",
      boxhd: "\u252C",
      boxHU: "\u2569",
      boxHu: "\u2567",
      boxhU: "\u2568",
      boxhu: "\u2534",
      boxminus: "\u229F",
      boxplus: "\u229E",
      boxtimes: "\u22A0",
      boxUL: "\u255D",
      boxUl: "\u255C",
      boxuL: "\u255B",
      boxul: "\u2518",
      boxUR: "\u255A",
      boxUr: "\u2559",
      boxuR: "\u2558",
      boxur: "\u2514",
      boxV: "\u2551",
      boxv: "\u2502",
      boxVH: "\u256C",
      boxVh: "\u256B",
      boxvH: "\u256A",
      boxvh: "\u253C",
      boxVL: "\u2563",
      boxVl: "\u2562",
      boxvL: "\u2561",
      boxvl: "\u2524",
      boxVR: "\u2560",
      boxVr: "\u255F",
      boxvR: "\u255E",
      boxvr: "\u251C",
      bprime: "\u2035",
      Breve: "\u02D8",
      breve: "\u02D8",
      brvbar: "\xA6",
      Bscr: "\u212C",
      bscr: "\u{1D4B7}",
      bsemi: "\u204F",
      bsim: "\u223D",
      bsime: "\u22CD",
      bsol: "\\",
      bsolb: "\u29C5",
      bsolhsub: "\u27C8",
      bull: "\u2022",
      bullet: "\u2022",
      bump: "\u224E",
      bumpE: "\u2AAE",
      bumpe: "\u224F",
      Bumpeq: "\u224E",
      bumpeq: "\u224F",
      Cacute: "\u0106",
      cacute: "\u0107",
      Cap: "\u22D2",
      cap: "\u2229",
      capand: "\u2A44",
      capbrcup: "\u2A49",
      capcap: "\u2A4B",
      capcup: "\u2A47",
      capdot: "\u2A40",
      CapitalDifferentialD: "\u2145",
      caps: "\u2229\uFE00",
      caret: "\u2041",
      caron: "\u02C7",
      Cayleys: "\u212D",
      ccaps: "\u2A4D",
      Ccaron: "\u010C",
      ccaron: "\u010D",
      Ccedil: "\xC7",
      ccedil: "\xE7",
      Ccirc: "\u0108",
      ccirc: "\u0109",
      Cconint: "\u2230",
      ccups: "\u2A4C",
      ccupssm: "\u2A50",
      Cdot: "\u010A",
      cdot: "\u010B",
      cedil: "\xB8",
      Cedilla: "\xB8",
      cemptyv: "\u29B2",
      cent: "\xA2",
      CenterDot: "\xB7",
      centerdot: "\xB7",
      Cfr: "\u212D",
      cfr: "\u{1D520}",
      CHcy: "\u0427",
      chcy: "\u0447",
      check: "\u2713",
      checkmark: "\u2713",
      Chi: "\u03A7",
      chi: "\u03C7",
      cir: "\u25CB",
      circ: "\u02C6",
      circeq: "\u2257",
      circlearrowleft: "\u21BA",
      circlearrowright: "\u21BB",
      circledast: "\u229B",
      circledcirc: "\u229A",
      circleddash: "\u229D",
      CircleDot: "\u2299",
      circledR: "\xAE",
      circledS: "\u24C8",
      CircleMinus: "\u2296",
      CirclePlus: "\u2295",
      CircleTimes: "\u2297",
      cirE: "\u29C3",
      cire: "\u2257",
      cirfnint: "\u2A10",
      cirmid: "\u2AEF",
      cirscir: "\u29C2",
      ClockwiseContourIntegral: "\u2232",
      CloseCurlyDoubleQuote: "\u201D",
      CloseCurlyQuote: "\u2019",
      clubs: "\u2663",
      clubsuit: "\u2663",
      Colon: "\u2237",
      colon: ":",
      Colone: "\u2A74",
      colone: "\u2254",
      coloneq: "\u2254",
      comma: ",",
      commat: "@",
      comp: "\u2201",
      compfn: "\u2218",
      complement: "\u2201",
      complexes: "\u2102",
      cong: "\u2245",
      congdot: "\u2A6D",
      Congruent: "\u2261",
      Conint: "\u222F",
      conint: "\u222E",
      ContourIntegral: "\u222E",
      Copf: "\u2102",
      copf: "\u{1D554}",
      coprod: "\u2210",
      Coproduct: "\u2210",
      COPY: "\xA9",
      copy: "\xA9",
      copysr: "\u2117",
      CounterClockwiseContourIntegral: "\u2233",
      crarr: "\u21B5",
      Cross: "\u2A2F",
      cross: "\u2717",
      Cscr: "\u{1D49E}",
      cscr: "\u{1D4B8}",
      csub: "\u2ACF",
      csube: "\u2AD1",
      csup: "\u2AD0",
      csupe: "\u2AD2",
      ctdot: "\u22EF",
      cudarrl: "\u2938",
      cudarrr: "\u2935",
      cuepr: "\u22DE",
      cuesc: "\u22DF",
      cularr: "\u21B6",
      cularrp: "\u293D",
      Cup: "\u22D3",
      cup: "\u222A",
      cupbrcap: "\u2A48",
      CupCap: "\u224D",
      cupcap: "\u2A46",
      cupcup: "\u2A4A",
      cupdot: "\u228D",
      cupor: "\u2A45",
      cups: "\u222A\uFE00",
      curarr: "\u21B7",
      curarrm: "\u293C",
      curlyeqprec: "\u22DE",
      curlyeqsucc: "\u22DF",
      curlyvee: "\u22CE",
      curlywedge: "\u22CF",
      curren: "\xA4",
      curvearrowleft: "\u21B6",
      curvearrowright: "\u21B7",
      cuvee: "\u22CE",
      cuwed: "\u22CF",
      cwconint: "\u2232",
      cwint: "\u2231",
      cylcty: "\u232D",
      Dagger: "\u2021",
      dagger: "\u2020",
      daleth: "\u2138",
      Darr: "\u21A1",
      dArr: "\u21D3",
      darr: "\u2193",
      dash: "\u2010",
      Dashv: "\u2AE4",
      dashv: "\u22A3",
      dbkarow: "\u290F",
      dblac: "\u02DD",
      Dcaron: "\u010E",
      dcaron: "\u010F",
      Dcy: "\u0414",
      dcy: "\u0434",
      DD: "\u2145",
      dd: "\u2146",
      ddagger: "\u2021",
      ddarr: "\u21CA",
      DDotrahd: "\u2911",
      ddotseq: "\u2A77",
      deg: "\xB0",
      Del: "\u2207",
      Delta: "\u0394",
      delta: "\u03B4",
      demptyv: "\u29B1",
      dfisht: "\u297F",
      Dfr: "\u{1D507}",
      dfr: "\u{1D521}",
      dHar: "\u2965",
      dharl: "\u21C3",
      dharr: "\u21C2",
      DiacriticalAcute: "\xB4",
      DiacriticalDot: "\u02D9",
      DiacriticalDoubleAcute: "\u02DD",
      DiacriticalGrave: "`",
      DiacriticalTilde: "\u02DC",
      diam: "\u22C4",
      Diamond: "\u22C4",
      diamond: "\u22C4",
      diamondsuit: "\u2666",
      diams: "\u2666",
      die: "\xA8",
      DifferentialD: "\u2146",
      digamma: "\u03DD",
      disin: "\u22F2",
      div: "\xF7",
      divide: "\xF7",
      divideontimes: "\u22C7",
      divonx: "\u22C7",
      DJcy: "\u0402",
      djcy: "\u0452",
      dlcorn: "\u231E",
      dlcrop: "\u230D",
      dollar: "$",
      Dopf: "\u{1D53B}",
      dopf: "\u{1D555}",
      Dot: "\xA8",
      dot: "\u02D9",
      DotDot: "\u20DC",
      doteq: "\u2250",
      doteqdot: "\u2251",
      DotEqual: "\u2250",
      dotminus: "\u2238",
      dotplus: "\u2214",
      dotsquare: "\u22A1",
      doublebarwedge: "\u2306",
      DoubleContourIntegral: "\u222F",
      DoubleDot: "\xA8",
      DoubleDownArrow: "\u21D3",
      DoubleLeftArrow: "\u21D0",
      DoubleLeftRightArrow: "\u21D4",
      DoubleLeftTee: "\u2AE4",
      DoubleLongLeftArrow: "\u27F8",
      DoubleLongLeftRightArrow: "\u27FA",
      DoubleLongRightArrow: "\u27F9",
      DoubleRightArrow: "\u21D2",
      DoubleRightTee: "\u22A8",
      DoubleUpArrow: "\u21D1",
      DoubleUpDownArrow: "\u21D5",
      DoubleVerticalBar: "\u2225",
      DownArrow: "\u2193",
      Downarrow: "\u21D3",
      downarrow: "\u2193",
      DownArrowBar: "\u2913",
      DownArrowUpArrow: "\u21F5",
      DownBreve: "\u0311",
      downdownarrows: "\u21CA",
      downharpoonleft: "\u21C3",
      downharpoonright: "\u21C2",
      DownLeftRightVector: "\u2950",
      DownLeftTeeVector: "\u295E",
      DownLeftVector: "\u21BD",
      DownLeftVectorBar: "\u2956",
      DownRightTeeVector: "\u295F",
      DownRightVector: "\u21C1",
      DownRightVectorBar: "\u2957",
      DownTee: "\u22A4",
      DownTeeArrow: "\u21A7",
      drbkarow: "\u2910",
      drcorn: "\u231F",
      drcrop: "\u230C",
      Dscr: "\u{1D49F}",
      dscr: "\u{1D4B9}",
      DScy: "\u0405",
      dscy: "\u0455",
      dsol: "\u29F6",
      Dstrok: "\u0110",
      dstrok: "\u0111",
      dtdot: "\u22F1",
      dtri: "\u25BF",
      dtrif: "\u25BE",
      duarr: "\u21F5",
      duhar: "\u296F",
      dwangle: "\u29A6",
      DZcy: "\u040F",
      dzcy: "\u045F",
      dzigrarr: "\u27FF",
      Eacute: "\xC9",
      eacute: "\xE9",
      easter: "\u2A6E",
      Ecaron: "\u011A",
      ecaron: "\u011B",
      ecir: "\u2256",
      Ecirc: "\xCA",
      ecirc: "\xEA",
      ecolon: "\u2255",
      Ecy: "\u042D",
      ecy: "\u044D",
      eDDot: "\u2A77",
      Edot: "\u0116",
      eDot: "\u2251",
      edot: "\u0117",
      ee: "\u2147",
      efDot: "\u2252",
      Efr: "\u{1D508}",
      efr: "\u{1D522}",
      eg: "\u2A9A",
      Egrave: "\xC8",
      egrave: "\xE8",
      egs: "\u2A96",
      egsdot: "\u2A98",
      el: "\u2A99",
      Element: "\u2208",
      elinters: "\u23E7",
      ell: "\u2113",
      els: "\u2A95",
      elsdot: "\u2A97",
      Emacr: "\u0112",
      emacr: "\u0113",
      empty: "\u2205",
      emptyset: "\u2205",
      EmptySmallSquare: "\u25FB",
      emptyv: "\u2205",
      EmptyVerySmallSquare: "\u25AB",
      emsp: "\u2003",
      emsp13: "\u2004",
      emsp14: "\u2005",
      ENG: "\u014A",
      eng: "\u014B",
      ensp: "\u2002",
      Eogon: "\u0118",
      eogon: "\u0119",
      Eopf: "\u{1D53C}",
      eopf: "\u{1D556}",
      epar: "\u22D5",
      eparsl: "\u29E3",
      eplus: "\u2A71",
      epsi: "\u03B5",
      Epsilon: "\u0395",
      epsilon: "\u03B5",
      epsiv: "\u03F5",
      eqcirc: "\u2256",
      eqcolon: "\u2255",
      eqsim: "\u2242",
      eqslantgtr: "\u2A96",
      eqslantless: "\u2A95",
      Equal: "\u2A75",
      equals: "=",
      EqualTilde: "\u2242",
      equest: "\u225F",
      Equilibrium: "\u21CC",
      equiv: "\u2261",
      equivDD: "\u2A78",
      eqvparsl: "\u29E5",
      erarr: "\u2971",
      erDot: "\u2253",
      Escr: "\u2130",
      escr: "\u212F",
      esdot: "\u2250",
      Esim: "\u2A73",
      esim: "\u2242",
      Eta: "\u0397",
      eta: "\u03B7",
      ETH: "\xD0",
      eth: "\xF0",
      Euml: "\xCB",
      euml: "\xEB",
      euro: "\u20AC",
      excl: "!",
      exist: "\u2203",
      Exists: "\u2203",
      expectation: "\u2130",
      ExponentialE: "\u2147",
      exponentiale: "\u2147",
      fallingdotseq: "\u2252",
      Fcy: "\u0424",
      fcy: "\u0444",
      female: "\u2640",
      ffilig: "\uFB03",
      fflig: "\uFB00",
      ffllig: "\uFB04",
      Ffr: "\u{1D509}",
      ffr: "\u{1D523}",
      filig: "\uFB01",
      FilledSmallSquare: "\u25FC",
      FilledVerySmallSquare: "\u25AA",
      fjlig: "fj",
      flat: "\u266D",
      fllig: "\uFB02",
      fltns: "\u25B1",
      fnof: "\u0192",
      Fopf: "\u{1D53D}",
      fopf: "\u{1D557}",
      ForAll: "\u2200",
      forall: "\u2200",
      fork: "\u22D4",
      forkv: "\u2AD9",
      Fouriertrf: "\u2131",
      fpartint: "\u2A0D",
      frac12: "\xBD",
      frac13: "\u2153",
      frac14: "\xBC",
      frac15: "\u2155",
      frac16: "\u2159",
      frac18: "\u215B",
      frac23: "\u2154",
      frac25: "\u2156",
      frac34: "\xBE",
      frac35: "\u2157",
      frac38: "\u215C",
      frac45: "\u2158",
      frac56: "\u215A",
      frac58: "\u215D",
      frac78: "\u215E",
      frasl: "\u2044",
      frown: "\u2322",
      Fscr: "\u2131",
      fscr: "\u{1D4BB}",
      gacute: "\u01F5",
      Gamma: "\u0393",
      gamma: "\u03B3",
      Gammad: "\u03DC",
      gammad: "\u03DD",
      gap: "\u2A86",
      Gbreve: "\u011E",
      gbreve: "\u011F",
      Gcedil: "\u0122",
      Gcirc: "\u011C",
      gcirc: "\u011D",
      Gcy: "\u0413",
      gcy: "\u0433",
      Gdot: "\u0120",
      gdot: "\u0121",
      gE: "\u2267",
      ge: "\u2265",
      gEl: "\u2A8C",
      gel: "\u22DB",
      geq: "\u2265",
      geqq: "\u2267",
      geqslant: "\u2A7E",
      ges: "\u2A7E",
      gescc: "\u2AA9",
      gesdot: "\u2A80",
      gesdoto: "\u2A82",
      gesdotol: "\u2A84",
      gesl: "\u22DB\uFE00",
      gesles: "\u2A94",
      Gfr: "\u{1D50A}",
      gfr: "\u{1D524}",
      Gg: "\u22D9",
      gg: "\u226B",
      ggg: "\u22D9",
      gimel: "\u2137",
      GJcy: "\u0403",
      gjcy: "\u0453",
      gl: "\u2277",
      gla: "\u2AA5",
      glE: "\u2A92",
      glj: "\u2AA4",
      gnap: "\u2A8A",
      gnapprox: "\u2A8A",
      gnE: "\u2269",
      gne: "\u2A88",
      gneq: "\u2A88",
      gneqq: "\u2269",
      gnsim: "\u22E7",
      Gopf: "\u{1D53E}",
      gopf: "\u{1D558}",
      grave: "`",
      GreaterEqual: "\u2265",
      GreaterEqualLess: "\u22DB",
      GreaterFullEqual: "\u2267",
      GreaterGreater: "\u2AA2",
      GreaterLess: "\u2277",
      GreaterSlantEqual: "\u2A7E",
      GreaterTilde: "\u2273",
      Gscr: "\u{1D4A2}",
      gscr: "\u210A",
      gsim: "\u2273",
      gsime: "\u2A8E",
      gsiml: "\u2A90",
      Gt: "\u226B",
      GT: ">",
      gt: ">",
      gtcc: "\u2AA7",
      gtcir: "\u2A7A",
      gtdot: "\u22D7",
      gtlPar: "\u2995",
      gtquest: "\u2A7C",
      gtrapprox: "\u2A86",
      gtrarr: "\u2978",
      gtrdot: "\u22D7",
      gtreqless: "\u22DB",
      gtreqqless: "\u2A8C",
      gtrless: "\u2277",
      gtrsim: "\u2273",
      gvertneqq: "\u2269\uFE00",
      gvnE: "\u2269\uFE00",
      Hacek: "\u02C7",
      hairsp: "\u200A",
      half: "\xBD",
      hamilt: "\u210B",
      HARDcy: "\u042A",
      hardcy: "\u044A",
      hArr: "\u21D4",
      harr: "\u2194",
      harrcir: "\u2948",
      harrw: "\u21AD",
      Hat: "^",
      hbar: "\u210F",
      Hcirc: "\u0124",
      hcirc: "\u0125",
      hearts: "\u2665",
      heartsuit: "\u2665",
      hellip: "\u2026",
      hercon: "\u22B9",
      Hfr: "\u210C",
      hfr: "\u{1D525}",
      HilbertSpace: "\u210B",
      hksearow: "\u2925",
      hkswarow: "\u2926",
      hoarr: "\u21FF",
      homtht: "\u223B",
      hookleftarrow: "\u21A9",
      hookrightarrow: "\u21AA",
      Hopf: "\u210D",
      hopf: "\u{1D559}",
      horbar: "\u2015",
      HorizontalLine: "\u2500",
      Hscr: "\u210B",
      hscr: "\u{1D4BD}",
      hslash: "\u210F",
      Hstrok: "\u0126",
      hstrok: "\u0127",
      HumpDownHump: "\u224E",
      HumpEqual: "\u224F",
      hybull: "\u2043",
      hyphen: "\u2010",
      Iacute: "\xCD",
      iacute: "\xED",
      ic: "\u2063",
      Icirc: "\xCE",
      icirc: "\xEE",
      Icy: "\u0418",
      icy: "\u0438",
      Idot: "\u0130",
      IEcy: "\u0415",
      iecy: "\u0435",
      iexcl: "\xA1",
      iff: "\u21D4",
      Ifr: "\u2111",
      ifr: "\u{1D526}",
      Igrave: "\xCC",
      igrave: "\xEC",
      ii: "\u2148",
      iiiint: "\u2A0C",
      iiint: "\u222D",
      iinfin: "\u29DC",
      iiota: "\u2129",
      IJlig: "\u0132",
      ijlig: "\u0133",
      Im: "\u2111",
      Imacr: "\u012A",
      imacr: "\u012B",
      image: "\u2111",
      ImaginaryI: "\u2148",
      imagline: "\u2110",
      imagpart: "\u2111",
      imath: "\u0131",
      imof: "\u22B7",
      imped: "\u01B5",
      Implies: "\u21D2",
      in: "\u2208",
      incare: "\u2105",
      infin: "\u221E",
      infintie: "\u29DD",
      inodot: "\u0131",
      Int: "\u222C",
      int: "\u222B",
      intcal: "\u22BA",
      integers: "\u2124",
      Integral: "\u222B",
      intercal: "\u22BA",
      Intersection: "\u22C2",
      intlarhk: "\u2A17",
      intprod: "\u2A3C",
      InvisibleComma: "\u2063",
      InvisibleTimes: "\u2062",
      IOcy: "\u0401",
      iocy: "\u0451",
      Iogon: "\u012E",
      iogon: "\u012F",
      Iopf: "\u{1D540}",
      iopf: "\u{1D55A}",
      Iota: "\u0399",
      iota: "\u03B9",
      iprod: "\u2A3C",
      iquest: "\xBF",
      Iscr: "\u2110",
      iscr: "\u{1D4BE}",
      isin: "\u2208",
      isindot: "\u22F5",
      isinE: "\u22F9",
      isins: "\u22F4",
      isinsv: "\u22F3",
      isinv: "\u2208",
      it: "\u2062",
      Itilde: "\u0128",
      itilde: "\u0129",
      Iukcy: "\u0406",
      iukcy: "\u0456",
      Iuml: "\xCF",
      iuml: "\xEF",
      Jcirc: "\u0134",
      jcirc: "\u0135",
      Jcy: "\u0419",
      jcy: "\u0439",
      Jfr: "\u{1D50D}",
      jfr: "\u{1D527}",
      jmath: "\u0237",
      Jopf: "\u{1D541}",
      jopf: "\u{1D55B}",
      Jscr: "\u{1D4A5}",
      jscr: "\u{1D4BF}",
      Jsercy: "\u0408",
      jsercy: "\u0458",
      Jukcy: "\u0404",
      jukcy: "\u0454",
      Kappa: "\u039A",
      kappa: "\u03BA",
      kappav: "\u03F0",
      Kcedil: "\u0136",
      kcedil: "\u0137",
      Kcy: "\u041A",
      kcy: "\u043A",
      Kfr: "\u{1D50E}",
      kfr: "\u{1D528}",
      kgreen: "\u0138",
      KHcy: "\u0425",
      khcy: "\u0445",
      KJcy: "\u040C",
      kjcy: "\u045C",
      Kopf: "\u{1D542}",
      kopf: "\u{1D55C}",
      Kscr: "\u{1D4A6}",
      kscr: "\u{1D4C0}",
      lAarr: "\u21DA",
      Lacute: "\u0139",
      lacute: "\u013A",
      laemptyv: "\u29B4",
      lagran: "\u2112",
      Lambda: "\u039B",
      lambda: "\u03BB",
      Lang: "\u27EA",
      lang: "\u27E8",
      langd: "\u2991",
      langle: "\u27E8",
      lap: "\u2A85",
      Laplacetrf: "\u2112",
      laquo: "\xAB",
      Larr: "\u219E",
      lArr: "\u21D0",
      larr: "\u2190",
      larrb: "\u21E4",
      larrbfs: "\u291F",
      larrfs: "\u291D",
      larrhk: "\u21A9",
      larrlp: "\u21AB",
      larrpl: "\u2939",
      larrsim: "\u2973",
      larrtl: "\u21A2",
      lat: "\u2AAB",
      lAtail: "\u291B",
      latail: "\u2919",
      late: "\u2AAD",
      lates: "\u2AAD\uFE00",
      lBarr: "\u290E",
      lbarr: "\u290C",
      lbbrk: "\u2772",
      lbrace: "{",
      lbrack: "[",
      lbrke: "\u298B",
      lbrksld: "\u298F",
      lbrkslu: "\u298D",
      Lcaron: "\u013D",
      lcaron: "\u013E",
      Lcedil: "\u013B",
      lcedil: "\u013C",
      lceil: "\u2308",
      lcub: "{",
      Lcy: "\u041B",
      lcy: "\u043B",
      ldca: "\u2936",
      ldquo: "\u201C",
      ldquor: "\u201E",
      ldrdhar: "\u2967",
      ldrushar: "\u294B",
      ldsh: "\u21B2",
      lE: "\u2266",
      le: "\u2264",
      LeftAngleBracket: "\u27E8",
      LeftArrow: "\u2190",
      Leftarrow: "\u21D0",
      leftarrow: "\u2190",
      LeftArrowBar: "\u21E4",
      LeftArrowRightArrow: "\u21C6",
      leftarrowtail: "\u21A2",
      LeftCeiling: "\u2308",
      LeftDoubleBracket: "\u27E6",
      LeftDownTeeVector: "\u2961",
      LeftDownVector: "\u21C3",
      LeftDownVectorBar: "\u2959",
      LeftFloor: "\u230A",
      leftharpoondown: "\u21BD",
      leftharpoonup: "\u21BC",
      leftleftarrows: "\u21C7",
      LeftRightArrow: "\u2194",
      Leftrightarrow: "\u21D4",
      leftrightarrow: "\u2194",
      leftrightarrows: "\u21C6",
      leftrightharpoons: "\u21CB",
      leftrightsquigarrow: "\u21AD",
      LeftRightVector: "\u294E",
      LeftTee: "\u22A3",
      LeftTeeArrow: "\u21A4",
      LeftTeeVector: "\u295A",
      leftthreetimes: "\u22CB",
      LeftTriangle: "\u22B2",
      LeftTriangleBar: "\u29CF",
      LeftTriangleEqual: "\u22B4",
      LeftUpDownVector: "\u2951",
      LeftUpTeeVector: "\u2960",
      LeftUpVector: "\u21BF",
      LeftUpVectorBar: "\u2958",
      LeftVector: "\u21BC",
      LeftVectorBar: "\u2952",
      lEg: "\u2A8B",
      leg: "\u22DA",
      leq: "\u2264",
      leqq: "\u2266",
      leqslant: "\u2A7D",
      les: "\u2A7D",
      lescc: "\u2AA8",
      lesdot: "\u2A7F",
      lesdoto: "\u2A81",
      lesdotor: "\u2A83",
      lesg: "\u22DA\uFE00",
      lesges: "\u2A93",
      lessapprox: "\u2A85",
      lessdot: "\u22D6",
      lesseqgtr: "\u22DA",
      lesseqqgtr: "\u2A8B",
      LessEqualGreater: "\u22DA",
      LessFullEqual: "\u2266",
      LessGreater: "\u2276",
      lessgtr: "\u2276",
      LessLess: "\u2AA1",
      lesssim: "\u2272",
      LessSlantEqual: "\u2A7D",
      LessTilde: "\u2272",
      lfisht: "\u297C",
      lfloor: "\u230A",
      Lfr: "\u{1D50F}",
      lfr: "\u{1D529}",
      lg: "\u2276",
      lgE: "\u2A91",
      lHar: "\u2962",
      lhard: "\u21BD",
      lharu: "\u21BC",
      lharul: "\u296A",
      lhblk: "\u2584",
      LJcy: "\u0409",
      ljcy: "\u0459",
      Ll: "\u22D8",
      ll: "\u226A",
      llarr: "\u21C7",
      llcorner: "\u231E",
      Lleftarrow: "\u21DA",
      llhard: "\u296B",
      lltri: "\u25FA",
      Lmidot: "\u013F",
      lmidot: "\u0140",
      lmoust: "\u23B0",
      lmoustache: "\u23B0",
      lnap: "\u2A89",
      lnapprox: "\u2A89",
      lnE: "\u2268",
      lne: "\u2A87",
      lneq: "\u2A87",
      lneqq: "\u2268",
      lnsim: "\u22E6",
      loang: "\u27EC",
      loarr: "\u21FD",
      lobrk: "\u27E6",
      LongLeftArrow: "\u27F5",
      Longleftarrow: "\u27F8",
      longleftarrow: "\u27F5",
      LongLeftRightArrow: "\u27F7",
      Longleftrightarrow: "\u27FA",
      longleftrightarrow: "\u27F7",
      longmapsto: "\u27FC",
      LongRightArrow: "\u27F6",
      Longrightarrow: "\u27F9",
      longrightarrow: "\u27F6",
      looparrowleft: "\u21AB",
      looparrowright: "\u21AC",
      lopar: "\u2985",
      Lopf: "\u{1D543}",
      lopf: "\u{1D55D}",
      loplus: "\u2A2D",
      lotimes: "\u2A34",
      lowast: "\u2217",
      lowbar: "_",
      LowerLeftArrow: "\u2199",
      LowerRightArrow: "\u2198",
      loz: "\u25CA",
      lozenge: "\u25CA",
      lozf: "\u29EB",
      lpar: "(",
      lparlt: "\u2993",
      lrarr: "\u21C6",
      lrcorner: "\u231F",
      lrhar: "\u21CB",
      lrhard: "\u296D",
      lrm: "\u200E",
      lrtri: "\u22BF",
      lsaquo: "\u2039",
      Lscr: "\u2112",
      lscr: "\u{1D4C1}",
      Lsh: "\u21B0",
      lsh: "\u21B0",
      lsim: "\u2272",
      lsime: "\u2A8D",
      lsimg: "\u2A8F",
      lsqb: "[",
      lsquo: "\u2018",
      lsquor: "\u201A",
      Lstrok: "\u0141",
      lstrok: "\u0142",
      Lt: "\u226A",
      LT: "<",
      lt: "<",
      ltcc: "\u2AA6",
      ltcir: "\u2A79",
      ltdot: "\u22D6",
      lthree: "\u22CB",
      ltimes: "\u22C9",
      ltlarr: "\u2976",
      ltquest: "\u2A7B",
      ltri: "\u25C3",
      ltrie: "\u22B4",
      ltrif: "\u25C2",
      ltrPar: "\u2996",
      lurdshar: "\u294A",
      luruhar: "\u2966",
      lvertneqq: "\u2268\uFE00",
      lvnE: "\u2268\uFE00",
      macr: "\xAF",
      male: "\u2642",
      malt: "\u2720",
      maltese: "\u2720",
      Map: "\u2905",
      map: "\u21A6",
      mapsto: "\u21A6",
      mapstodown: "\u21A7",
      mapstoleft: "\u21A4",
      mapstoup: "\u21A5",
      marker: "\u25AE",
      mcomma: "\u2A29",
      Mcy: "\u041C",
      mcy: "\u043C",
      mdash: "\u2014",
      mDDot: "\u223A",
      measuredangle: "\u2221",
      MediumSpace: "\u205F",
      Mellintrf: "\u2133",
      Mfr: "\u{1D510}",
      mfr: "\u{1D52A}",
      mho: "\u2127",
      micro: "\xB5",
      mid: "\u2223",
      midast: "*",
      midcir: "\u2AF0",
      middot: "\xB7",
      minus: "\u2212",
      minusb: "\u229F",
      minusd: "\u2238",
      minusdu: "\u2A2A",
      MinusPlus: "\u2213",
      mlcp: "\u2ADB",
      mldr: "\u2026",
      mnplus: "\u2213",
      models: "\u22A7",
      Mopf: "\u{1D544}",
      mopf: "\u{1D55E}",
      mp: "\u2213",
      Mscr: "\u2133",
      mscr: "\u{1D4C2}",
      mstpos: "\u223E",
      Mu: "\u039C",
      mu: "\u03BC",
      multimap: "\u22B8",
      mumap: "\u22B8",
      nabla: "\u2207",
      Nacute: "\u0143",
      nacute: "\u0144",
      nang: "\u2220\u20D2",
      nap: "\u2249",
      napE: "\u2A70\u0338",
      napid: "\u224B\u0338",
      napos: "\u0149",
      napprox: "\u2249",
      natur: "\u266E",
      natural: "\u266E",
      naturals: "\u2115",
      nbsp: "\xA0",
      nbump: "\u224E\u0338",
      nbumpe: "\u224F\u0338",
      ncap: "\u2A43",
      Ncaron: "\u0147",
      ncaron: "\u0148",
      Ncedil: "\u0145",
      ncedil: "\u0146",
      ncong: "\u2247",
      ncongdot: "\u2A6D\u0338",
      ncup: "\u2A42",
      Ncy: "\u041D",
      ncy: "\u043D",
      ndash: "\u2013",
      ne: "\u2260",
      nearhk: "\u2924",
      neArr: "\u21D7",
      nearr: "\u2197",
      nearrow: "\u2197",
      nedot: "\u2250\u0338",
      NegativeMediumSpace: "\u200B",
      NegativeThickSpace: "\u200B",
      NegativeThinSpace: "\u200B",
      NegativeVeryThinSpace: "\u200B",
      nequiv: "\u2262",
      nesear: "\u2928",
      nesim: "\u2242\u0338",
      NestedGreaterGreater: "\u226B",
      NestedLessLess: "\u226A",
      NewLine: "\n",
      nexist: "\u2204",
      nexists: "\u2204",
      Nfr: "\u{1D511}",
      nfr: "\u{1D52B}",
      ngE: "\u2267\u0338",
      nge: "\u2271",
      ngeq: "\u2271",
      ngeqq: "\u2267\u0338",
      ngeqslant: "\u2A7E\u0338",
      nges: "\u2A7E\u0338",
      nGg: "\u22D9\u0338",
      ngsim: "\u2275",
      nGt: "\u226B\u20D2",
      ngt: "\u226F",
      ngtr: "\u226F",
      nGtv: "\u226B\u0338",
      nhArr: "\u21CE",
      nharr: "\u21AE",
      nhpar: "\u2AF2",
      ni: "\u220B",
      nis: "\u22FC",
      nisd: "\u22FA",
      niv: "\u220B",
      NJcy: "\u040A",
      njcy: "\u045A",
      nlArr: "\u21CD",
      nlarr: "\u219A",
      nldr: "\u2025",
      nlE: "\u2266\u0338",
      nle: "\u2270",
      nLeftarrow: "\u21CD",
      nleftarrow: "\u219A",
      nLeftrightarrow: "\u21CE",
      nleftrightarrow: "\u21AE",
      nleq: "\u2270",
      nleqq: "\u2266\u0338",
      nleqslant: "\u2A7D\u0338",
      nles: "\u2A7D\u0338",
      nless: "\u226E",
      nLl: "\u22D8\u0338",
      nlsim: "\u2274",
      nLt: "\u226A\u20D2",
      nlt: "\u226E",
      nltri: "\u22EA",
      nltrie: "\u22EC",
      nLtv: "\u226A\u0338",
      nmid: "\u2224",
      NoBreak: "\u2060",
      NonBreakingSpace: "\xA0",
      Nopf: "\u2115",
      nopf: "\u{1D55F}",
      Not: "\u2AEC",
      not: "\xAC",
      NotCongruent: "\u2262",
      NotCupCap: "\u226D",
      NotDoubleVerticalBar: "\u2226",
      NotElement: "\u2209",
      NotEqual: "\u2260",
      NotEqualTilde: "\u2242\u0338",
      NotExists: "\u2204",
      NotGreater: "\u226F",
      NotGreaterEqual: "\u2271",
      NotGreaterFullEqual: "\u2267\u0338",
      NotGreaterGreater: "\u226B\u0338",
      NotGreaterLess: "\u2279",
      NotGreaterSlantEqual: "\u2A7E\u0338",
      NotGreaterTilde: "\u2275",
      NotHumpDownHump: "\u224E\u0338",
      NotHumpEqual: "\u224F\u0338",
      notin: "\u2209",
      notindot: "\u22F5\u0338",
      notinE: "\u22F9\u0338",
      notinva: "\u2209",
      notinvb: "\u22F7",
      notinvc: "\u22F6",
      NotLeftTriangle: "\u22EA",
      NotLeftTriangleBar: "\u29CF\u0338",
      NotLeftTriangleEqual: "\u22EC",
      NotLess: "\u226E",
      NotLessEqual: "\u2270",
      NotLessGreater: "\u2278",
      NotLessLess: "\u226A\u0338",
      NotLessSlantEqual: "\u2A7D\u0338",
      NotLessTilde: "\u2274",
      NotNestedGreaterGreater: "\u2AA2\u0338",
      NotNestedLessLess: "\u2AA1\u0338",
      notni: "\u220C",
      notniva: "\u220C",
      notnivb: "\u22FE",
      notnivc: "\u22FD",
      NotPrecedes: "\u2280",
      NotPrecedesEqual: "\u2AAF\u0338",
      NotPrecedesSlantEqual: "\u22E0",
      NotReverseElement: "\u220C",
      NotRightTriangle: "\u22EB",
      NotRightTriangleBar: "\u29D0\u0338",
      NotRightTriangleEqual: "\u22ED",
      NotSquareSubset: "\u228F\u0338",
      NotSquareSubsetEqual: "\u22E2",
      NotSquareSuperset: "\u2290\u0338",
      NotSquareSupersetEqual: "\u22E3",
      NotSubset: "\u2282\u20D2",
      NotSubsetEqual: "\u2288",
      NotSucceeds: "\u2281",
      NotSucceedsEqual: "\u2AB0\u0338",
      NotSucceedsSlantEqual: "\u22E1",
      NotSucceedsTilde: "\u227F\u0338",
      NotSuperset: "\u2283\u20D2",
      NotSupersetEqual: "\u2289",
      NotTilde: "\u2241",
      NotTildeEqual: "\u2244",
      NotTildeFullEqual: "\u2247",
      NotTildeTilde: "\u2249",
      NotVerticalBar: "\u2224",
      npar: "\u2226",
      nparallel: "\u2226",
      nparsl: "\u2AFD\u20E5",
      npart: "\u2202\u0338",
      npolint: "\u2A14",
      npr: "\u2280",
      nprcue: "\u22E0",
      npre: "\u2AAF\u0338",
      nprec: "\u2280",
      npreceq: "\u2AAF\u0338",
      nrArr: "\u21CF",
      nrarr: "\u219B",
      nrarrc: "\u2933\u0338",
      nrarrw: "\u219D\u0338",
      nRightarrow: "\u21CF",
      nrightarrow: "\u219B",
      nrtri: "\u22EB",
      nrtrie: "\u22ED",
      nsc: "\u2281",
      nsccue: "\u22E1",
      nsce: "\u2AB0\u0338",
      Nscr: "\u{1D4A9}",
      nscr: "\u{1D4C3}",
      nshortmid: "\u2224",
      nshortparallel: "\u2226",
      nsim: "\u2241",
      nsime: "\u2244",
      nsimeq: "\u2244",
      nsmid: "\u2224",
      nspar: "\u2226",
      nsqsube: "\u22E2",
      nsqsupe: "\u22E3",
      nsub: "\u2284",
      nsubE: "\u2AC5\u0338",
      nsube: "\u2288",
      nsubset: "\u2282\u20D2",
      nsubseteq: "\u2288",
      nsubseteqq: "\u2AC5\u0338",
      nsucc: "\u2281",
      nsucceq: "\u2AB0\u0338",
      nsup: "\u2285",
      nsupE: "\u2AC6\u0338",
      nsupe: "\u2289",
      nsupset: "\u2283\u20D2",
      nsupseteq: "\u2289",
      nsupseteqq: "\u2AC6\u0338",
      ntgl: "\u2279",
      Ntilde: "\xD1",
      ntilde: "\xF1",
      ntlg: "\u2278",
      ntriangleleft: "\u22EA",
      ntrianglelefteq: "\u22EC",
      ntriangleright: "\u22EB",
      ntrianglerighteq: "\u22ED",
      Nu: "\u039D",
      nu: "\u03BD",
      num: "#",
      numero: "\u2116",
      numsp: "\u2007",
      nvap: "\u224D\u20D2",
      nVDash: "\u22AF",
      nVdash: "\u22AE",
      nvDash: "\u22AD",
      nvdash: "\u22AC",
      nvge: "\u2265\u20D2",
      nvgt: ">\u20D2",
      nvHarr: "\u2904",
      nvinfin: "\u29DE",
      nvlArr: "\u2902",
      nvle: "\u2264\u20D2",
      nvlt: "<\u20D2",
      nvltrie: "\u22B4\u20D2",
      nvrArr: "\u2903",
      nvrtrie: "\u22B5\u20D2",
      nvsim: "\u223C\u20D2",
      nwarhk: "\u2923",
      nwArr: "\u21D6",
      nwarr: "\u2196",
      nwarrow: "\u2196",
      nwnear: "\u2927",
      Oacute: "\xD3",
      oacute: "\xF3",
      oast: "\u229B",
      ocir: "\u229A",
      Ocirc: "\xD4",
      ocirc: "\xF4",
      Ocy: "\u041E",
      ocy: "\u043E",
      odash: "\u229D",
      Odblac: "\u0150",
      odblac: "\u0151",
      odiv: "\u2A38",
      odot: "\u2299",
      odsold: "\u29BC",
      OElig: "\u0152",
      oelig: "\u0153",
      ofcir: "\u29BF",
      Ofr: "\u{1D512}",
      ofr: "\u{1D52C}",
      ogon: "\u02DB",
      Ograve: "\xD2",
      ograve: "\xF2",
      ogt: "\u29C1",
      ohbar: "\u29B5",
      ohm: "\u03A9",
      oint: "\u222E",
      olarr: "\u21BA",
      olcir: "\u29BE",
      olcross: "\u29BB",
      oline: "\u203E",
      olt: "\u29C0",
      Omacr: "\u014C",
      omacr: "\u014D",
      Omega: "\u03A9",
      omega: "\u03C9",
      Omicron: "\u039F",
      omicron: "\u03BF",
      omid: "\u29B6",
      ominus: "\u2296",
      Oopf: "\u{1D546}",
      oopf: "\u{1D560}",
      opar: "\u29B7",
      OpenCurlyDoubleQuote: "\u201C",
      OpenCurlyQuote: "\u2018",
      operp: "\u29B9",
      oplus: "\u2295",
      Or: "\u2A54",
      or: "\u2228",
      orarr: "\u21BB",
      ord: "\u2A5D",
      order: "\u2134",
      orderof: "\u2134",
      ordf: "\xAA",
      ordm: "\xBA",
      origof: "\u22B6",
      oror: "\u2A56",
      orslope: "\u2A57",
      orv: "\u2A5B",
      oS: "\u24C8",
      Oscr: "\u{1D4AA}",
      oscr: "\u2134",
      Oslash: "\xD8",
      oslash: "\xF8",
      osol: "\u2298",
      Otilde: "\xD5",
      otilde: "\xF5",
      Otimes: "\u2A37",
      otimes: "\u2297",
      otimesas: "\u2A36",
      Ouml: "\xD6",
      ouml: "\xF6",
      ovbar: "\u233D",
      OverBar: "\u203E",
      OverBrace: "\u23DE",
      OverBracket: "\u23B4",
      OverParenthesis: "\u23DC",
      par: "\u2225",
      para: "\xB6",
      parallel: "\u2225",
      parsim: "\u2AF3",
      parsl: "\u2AFD",
      part: "\u2202",
      PartialD: "\u2202",
      Pcy: "\u041F",
      pcy: "\u043F",
      percnt: "%",
      period: ".",
      permil: "\u2030",
      perp: "\u22A5",
      pertenk: "\u2031",
      Pfr: "\u{1D513}",
      pfr: "\u{1D52D}",
      Phi: "\u03A6",
      phi: "\u03C6",
      phiv: "\u03D5",
      phmmat: "\u2133",
      phone: "\u260E",
      Pi: "\u03A0",
      pi: "\u03C0",
      pitchfork: "\u22D4",
      piv: "\u03D6",
      planck: "\u210F",
      planckh: "\u210E",
      plankv: "\u210F",
      plus: "+",
      plusacir: "\u2A23",
      plusb: "\u229E",
      pluscir: "\u2A22",
      plusdo: "\u2214",
      plusdu: "\u2A25",
      pluse: "\u2A72",
      PlusMinus: "\xB1",
      plusmn: "\xB1",
      plussim: "\u2A26",
      plustwo: "\u2A27",
      pm: "\xB1",
      Poincareplane: "\u210C",
      pointint: "\u2A15",
      Popf: "\u2119",
      popf: "\u{1D561}",
      pound: "\xA3",
      Pr: "\u2ABB",
      pr: "\u227A",
      prap: "\u2AB7",
      prcue: "\u227C",
      prE: "\u2AB3",
      pre: "\u2AAF",
      prec: "\u227A",
      precapprox: "\u2AB7",
      preccurlyeq: "\u227C",
      Precedes: "\u227A",
      PrecedesEqual: "\u2AAF",
      PrecedesSlantEqual: "\u227C",
      PrecedesTilde: "\u227E",
      preceq: "\u2AAF",
      precnapprox: "\u2AB9",
      precneqq: "\u2AB5",
      precnsim: "\u22E8",
      precsim: "\u227E",
      Prime: "\u2033",
      prime: "\u2032",
      primes: "\u2119",
      prnap: "\u2AB9",
      prnE: "\u2AB5",
      prnsim: "\u22E8",
      prod: "\u220F",
      Product: "\u220F",
      profalar: "\u232E",
      profline: "\u2312",
      profsurf: "\u2313",
      prop: "\u221D",
      Proportion: "\u2237",
      Proportional: "\u221D",
      propto: "\u221D",
      prsim: "\u227E",
      prurel: "\u22B0",
      Pscr: "\u{1D4AB}",
      pscr: "\u{1D4C5}",
      Psi: "\u03A8",
      psi: "\u03C8",
      puncsp: "\u2008",
      Qfr: "\u{1D514}",
      qfr: "\u{1D52E}",
      qint: "\u2A0C",
      Qopf: "\u211A",
      qopf: "\u{1D562}",
      qprime: "\u2057",
      Qscr: "\u{1D4AC}",
      qscr: "\u{1D4C6}",
      quaternions: "\u210D",
      quatint: "\u2A16",
      quest: "?",
      questeq: "\u225F",
      QUOT: '"',
      quot: '"',
      rAarr: "\u21DB",
      race: "\u223D\u0331",
      Racute: "\u0154",
      racute: "\u0155",
      radic: "\u221A",
      raemptyv: "\u29B3",
      Rang: "\u27EB",
      rang: "\u27E9",
      rangd: "\u2992",
      range: "\u29A5",
      rangle: "\u27E9",
      raquo: "\xBB",
      Rarr: "\u21A0",
      rArr: "\u21D2",
      rarr: "\u2192",
      rarrap: "\u2975",
      rarrb: "\u21E5",
      rarrbfs: "\u2920",
      rarrc: "\u2933",
      rarrfs: "\u291E",
      rarrhk: "\u21AA",
      rarrlp: "\u21AC",
      rarrpl: "\u2945",
      rarrsim: "\u2974",
      Rarrtl: "\u2916",
      rarrtl: "\u21A3",
      rarrw: "\u219D",
      rAtail: "\u291C",
      ratail: "\u291A",
      ratio: "\u2236",
      rationals: "\u211A",
      RBarr: "\u2910",
      rBarr: "\u290F",
      rbarr: "\u290D",
      rbbrk: "\u2773",
      rbrace: "}",
      rbrack: "]",
      rbrke: "\u298C",
      rbrksld: "\u298E",
      rbrkslu: "\u2990",
      Rcaron: "\u0158",
      rcaron: "\u0159",
      Rcedil: "\u0156",
      rcedil: "\u0157",
      rceil: "\u2309",
      rcub: "}",
      Rcy: "\u0420",
      rcy: "\u0440",
      rdca: "\u2937",
      rdldhar: "\u2969",
      rdquo: "\u201D",
      rdquor: "\u201D",
      rdsh: "\u21B3",
      Re: "\u211C",
      real: "\u211C",
      realine: "\u211B",
      realpart: "\u211C",
      reals: "\u211D",
      rect: "\u25AD",
      REG: "\xAE",
      reg: "\xAE",
      ReverseElement: "\u220B",
      ReverseEquilibrium: "\u21CB",
      ReverseUpEquilibrium: "\u296F",
      rfisht: "\u297D",
      rfloor: "\u230B",
      Rfr: "\u211C",
      rfr: "\u{1D52F}",
      rHar: "\u2964",
      rhard: "\u21C1",
      rharu: "\u21C0",
      rharul: "\u296C",
      Rho: "\u03A1",
      rho: "\u03C1",
      rhov: "\u03F1",
      RightAngleBracket: "\u27E9",
      RightArrow: "\u2192",
      Rightarrow: "\u21D2",
      rightarrow: "\u2192",
      RightArrowBar: "\u21E5",
      RightArrowLeftArrow: "\u21C4",
      rightarrowtail: "\u21A3",
      RightCeiling: "\u2309",
      RightDoubleBracket: "\u27E7",
      RightDownTeeVector: "\u295D",
      RightDownVector: "\u21C2",
      RightDownVectorBar: "\u2955",
      RightFloor: "\u230B",
      rightharpoondown: "\u21C1",
      rightharpoonup: "\u21C0",
      rightleftarrows: "\u21C4",
      rightleftharpoons: "\u21CC",
      rightrightarrows: "\u21C9",
      rightsquigarrow: "\u219D",
      RightTee: "\u22A2",
      RightTeeArrow: "\u21A6",
      RightTeeVector: "\u295B",
      rightthreetimes: "\u22CC",
      RightTriangle: "\u22B3",
      RightTriangleBar: "\u29D0",
      RightTriangleEqual: "\u22B5",
      RightUpDownVector: "\u294F",
      RightUpTeeVector: "\u295C",
      RightUpVector: "\u21BE",
      RightUpVectorBar: "\u2954",
      RightVector: "\u21C0",
      RightVectorBar: "\u2953",
      ring: "\u02DA",
      risingdotseq: "\u2253",
      rlarr: "\u21C4",
      rlhar: "\u21CC",
      rlm: "\u200F",
      rmoust: "\u23B1",
      rmoustache: "\u23B1",
      rnmid: "\u2AEE",
      roang: "\u27ED",
      roarr: "\u21FE",
      robrk: "\u27E7",
      ropar: "\u2986",
      Ropf: "\u211D",
      ropf: "\u{1D563}",
      roplus: "\u2A2E",
      rotimes: "\u2A35",
      RoundImplies: "\u2970",
      rpar: ")",
      rpargt: "\u2994",
      rppolint: "\u2A12",
      rrarr: "\u21C9",
      Rrightarrow: "\u21DB",
      rsaquo: "\u203A",
      Rscr: "\u211B",
      rscr: "\u{1D4C7}",
      Rsh: "\u21B1",
      rsh: "\u21B1",
      rsqb: "]",
      rsquo: "\u2019",
      rsquor: "\u2019",
      rthree: "\u22CC",
      rtimes: "\u22CA",
      rtri: "\u25B9",
      rtrie: "\u22B5",
      rtrif: "\u25B8",
      rtriltri: "\u29CE",
      RuleDelayed: "\u29F4",
      ruluhar: "\u2968",
      rx: "\u211E",
      Sacute: "\u015A",
      sacute: "\u015B",
      sbquo: "\u201A",
      Sc: "\u2ABC",
      sc: "\u227B",
      scap: "\u2AB8",
      Scaron: "\u0160",
      scaron: "\u0161",
      sccue: "\u227D",
      scE: "\u2AB4",
      sce: "\u2AB0",
      Scedil: "\u015E",
      scedil: "\u015F",
      Scirc: "\u015C",
      scirc: "\u015D",
      scnap: "\u2ABA",
      scnE: "\u2AB6",
      scnsim: "\u22E9",
      scpolint: "\u2A13",
      scsim: "\u227F",
      Scy: "\u0421",
      scy: "\u0441",
      sdot: "\u22C5",
      sdotb: "\u22A1",
      sdote: "\u2A66",
      searhk: "\u2925",
      seArr: "\u21D8",
      searr: "\u2198",
      searrow: "\u2198",
      sect: "\xA7",
      semi: ";",
      seswar: "\u2929",
      setminus: "\u2216",
      setmn: "\u2216",
      sext: "\u2736",
      Sfr: "\u{1D516}",
      sfr: "\u{1D530}",
      sfrown: "\u2322",
      sharp: "\u266F",
      SHCHcy: "\u0429",
      shchcy: "\u0449",
      SHcy: "\u0428",
      shcy: "\u0448",
      ShortDownArrow: "\u2193",
      ShortLeftArrow: "\u2190",
      shortmid: "\u2223",
      shortparallel: "\u2225",
      ShortRightArrow: "\u2192",
      ShortUpArrow: "\u2191",
      shy: "\xAD",
      Sigma: "\u03A3",
      sigma: "\u03C3",
      sigmaf: "\u03C2",
      sigmav: "\u03C2",
      sim: "\u223C",
      simdot: "\u2A6A",
      sime: "\u2243",
      simeq: "\u2243",
      simg: "\u2A9E",
      simgE: "\u2AA0",
      siml: "\u2A9D",
      simlE: "\u2A9F",
      simne: "\u2246",
      simplus: "\u2A24",
      simrarr: "\u2972",
      slarr: "\u2190",
      SmallCircle: "\u2218",
      smallsetminus: "\u2216",
      smashp: "\u2A33",
      smeparsl: "\u29E4",
      smid: "\u2223",
      smile: "\u2323",
      smt: "\u2AAA",
      smte: "\u2AAC",
      smtes: "\u2AAC\uFE00",
      SOFTcy: "\u042C",
      softcy: "\u044C",
      sol: "/",
      solb: "\u29C4",
      solbar: "\u233F",
      Sopf: "\u{1D54A}",
      sopf: "\u{1D564}",
      spades: "\u2660",
      spadesuit: "\u2660",
      spar: "\u2225",
      sqcap: "\u2293",
      sqcaps: "\u2293\uFE00",
      sqcup: "\u2294",
      sqcups: "\u2294\uFE00",
      Sqrt: "\u221A",
      sqsub: "\u228F",
      sqsube: "\u2291",
      sqsubset: "\u228F",
      sqsubseteq: "\u2291",
      sqsup: "\u2290",
      sqsupe: "\u2292",
      sqsupset: "\u2290",
      sqsupseteq: "\u2292",
      squ: "\u25A1",
      Square: "\u25A1",
      square: "\u25A1",
      SquareIntersection: "\u2293",
      SquareSubset: "\u228F",
      SquareSubsetEqual: "\u2291",
      SquareSuperset: "\u2290",
      SquareSupersetEqual: "\u2292",
      SquareUnion: "\u2294",
      squarf: "\u25AA",
      squf: "\u25AA",
      srarr: "\u2192",
      Sscr: "\u{1D4AE}",
      sscr: "\u{1D4C8}",
      ssetmn: "\u2216",
      ssmile: "\u2323",
      sstarf: "\u22C6",
      Star: "\u22C6",
      star: "\u2606",
      starf: "\u2605",
      straightepsilon: "\u03F5",
      straightphi: "\u03D5",
      strns: "\xAF",
      Sub: "\u22D0",
      sub: "\u2282",
      subdot: "\u2ABD",
      subE: "\u2AC5",
      sube: "\u2286",
      subedot: "\u2AC3",
      submult: "\u2AC1",
      subnE: "\u2ACB",
      subne: "\u228A",
      subplus: "\u2ABF",
      subrarr: "\u2979",
      Subset: "\u22D0",
      subset: "\u2282",
      subseteq: "\u2286",
      subseteqq: "\u2AC5",
      SubsetEqual: "\u2286",
      subsetneq: "\u228A",
      subsetneqq: "\u2ACB",
      subsim: "\u2AC7",
      subsub: "\u2AD5",
      subsup: "\u2AD3",
      succ: "\u227B",
      succapprox: "\u2AB8",
      succcurlyeq: "\u227D",
      Succeeds: "\u227B",
      SucceedsEqual: "\u2AB0",
      SucceedsSlantEqual: "\u227D",
      SucceedsTilde: "\u227F",
      succeq: "\u2AB0",
      succnapprox: "\u2ABA",
      succneqq: "\u2AB6",
      succnsim: "\u22E9",
      succsim: "\u227F",
      SuchThat: "\u220B",
      Sum: "\u2211",
      sum: "\u2211",
      sung: "\u266A",
      Sup: "\u22D1",
      sup: "\u2283",
      sup1: "\xB9",
      sup2: "\xB2",
      sup3: "\xB3",
      supdot: "\u2ABE",
      supdsub: "\u2AD8",
      supE: "\u2AC6",
      supe: "\u2287",
      supedot: "\u2AC4",
      Superset: "\u2283",
      SupersetEqual: "\u2287",
      suphsol: "\u27C9",
      suphsub: "\u2AD7",
      suplarr: "\u297B",
      supmult: "\u2AC2",
      supnE: "\u2ACC",
      supne: "\u228B",
      supplus: "\u2AC0",
      Supset: "\u22D1",
      supset: "\u2283",
      supseteq: "\u2287",
      supseteqq: "\u2AC6",
      supsetneq: "\u228B",
      supsetneqq: "\u2ACC",
      supsim: "\u2AC8",
      supsub: "\u2AD4",
      supsup: "\u2AD6",
      swarhk: "\u2926",
      swArr: "\u21D9",
      swarr: "\u2199",
      swarrow: "\u2199",
      swnwar: "\u292A",
      szlig: "\xDF",
      Tab: "	",
      target: "\u2316",
      Tau: "\u03A4",
      tau: "\u03C4",
      tbrk: "\u23B4",
      Tcaron: "\u0164",
      tcaron: "\u0165",
      Tcedil: "\u0162",
      tcedil: "\u0163",
      Tcy: "\u0422",
      tcy: "\u0442",
      tdot: "\u20DB",
      telrec: "\u2315",
      Tfr: "\u{1D517}",
      tfr: "\u{1D531}",
      there4: "\u2234",
      Therefore: "\u2234",
      therefore: "\u2234",
      Theta: "\u0398",
      theta: "\u03B8",
      thetasym: "\u03D1",
      thetav: "\u03D1",
      thickapprox: "\u2248",
      thicksim: "\u223C",
      ThickSpace: "\u205F\u200A",
      thinsp: "\u2009",
      ThinSpace: "\u2009",
      thkap: "\u2248",
      thksim: "\u223C",
      THORN: "\xDE",
      thorn: "\xFE",
      Tilde: "\u223C",
      tilde: "\u02DC",
      TildeEqual: "\u2243",
      TildeFullEqual: "\u2245",
      TildeTilde: "\u2248",
      times: "\xD7",
      timesb: "\u22A0",
      timesbar: "\u2A31",
      timesd: "\u2A30",
      tint: "\u222D",
      toea: "\u2928",
      top: "\u22A4",
      topbot: "\u2336",
      topcir: "\u2AF1",
      Topf: "\u{1D54B}",
      topf: "\u{1D565}",
      topfork: "\u2ADA",
      tosa: "\u2929",
      tprime: "\u2034",
      TRADE: "\u2122",
      trade: "\u2122",
      triangle: "\u25B5",
      triangledown: "\u25BF",
      triangleleft: "\u25C3",
      trianglelefteq: "\u22B4",
      triangleq: "\u225C",
      triangleright: "\u25B9",
      trianglerighteq: "\u22B5",
      tridot: "\u25EC",
      trie: "\u225C",
      triminus: "\u2A3A",
      TripleDot: "\u20DB",
      triplus: "\u2A39",
      trisb: "\u29CD",
      tritime: "\u2A3B",
      trpezium: "\u23E2",
      Tscr: "\u{1D4AF}",
      tscr: "\u{1D4C9}",
      TScy: "\u0426",
      tscy: "\u0446",
      TSHcy: "\u040B",
      tshcy: "\u045B",
      Tstrok: "\u0166",
      tstrok: "\u0167",
      twixt: "\u226C",
      twoheadleftarrow: "\u219E",
      twoheadrightarrow: "\u21A0",
      Uacute: "\xDA",
      uacute: "\xFA",
      Uarr: "\u219F",
      uArr: "\u21D1",
      uarr: "\u2191",
      Uarrocir: "\u2949",
      Ubrcy: "\u040E",
      ubrcy: "\u045E",
      Ubreve: "\u016C",
      ubreve: "\u016D",
      Ucirc: "\xDB",
      ucirc: "\xFB",
      Ucy: "\u0423",
      ucy: "\u0443",
      udarr: "\u21C5",
      Udblac: "\u0170",
      udblac: "\u0171",
      udhar: "\u296E",
      ufisht: "\u297E",
      Ufr: "\u{1D518}",
      ufr: "\u{1D532}",
      Ugrave: "\xD9",
      ugrave: "\xF9",
      uHar: "\u2963",
      uharl: "\u21BF",
      uharr: "\u21BE",
      uhblk: "\u2580",
      ulcorn: "\u231C",
      ulcorner: "\u231C",
      ulcrop: "\u230F",
      ultri: "\u25F8",
      Umacr: "\u016A",
      umacr: "\u016B",
      uml: "\xA8",
      UnderBar: "_",
      UnderBrace: "\u23DF",
      UnderBracket: "\u23B5",
      UnderParenthesis: "\u23DD",
      Union: "\u22C3",
      UnionPlus: "\u228E",
      Uogon: "\u0172",
      uogon: "\u0173",
      Uopf: "\u{1D54C}",
      uopf: "\u{1D566}",
      UpArrow: "\u2191",
      Uparrow: "\u21D1",
      uparrow: "\u2191",
      UpArrowBar: "\u2912",
      UpArrowDownArrow: "\u21C5",
      UpDownArrow: "\u2195",
      Updownarrow: "\u21D5",
      updownarrow: "\u2195",
      UpEquilibrium: "\u296E",
      upharpoonleft: "\u21BF",
      upharpoonright: "\u21BE",
      uplus: "\u228E",
      UpperLeftArrow: "\u2196",
      UpperRightArrow: "\u2197",
      Upsi: "\u03D2",
      upsi: "\u03C5",
      upsih: "\u03D2",
      Upsilon: "\u03A5",
      upsilon: "\u03C5",
      UpTee: "\u22A5",
      UpTeeArrow: "\u21A5",
      upuparrows: "\u21C8",
      urcorn: "\u231D",
      urcorner: "\u231D",
      urcrop: "\u230E",
      Uring: "\u016E",
      uring: "\u016F",
      urtri: "\u25F9",
      Uscr: "\u{1D4B0}",
      uscr: "\u{1D4CA}",
      utdot: "\u22F0",
      Utilde: "\u0168",
      utilde: "\u0169",
      utri: "\u25B5",
      utrif: "\u25B4",
      uuarr: "\u21C8",
      Uuml: "\xDC",
      uuml: "\xFC",
      uwangle: "\u29A7",
      vangrt: "\u299C",
      varepsilon: "\u03F5",
      varkappa: "\u03F0",
      varnothing: "\u2205",
      varphi: "\u03D5",
      varpi: "\u03D6",
      varpropto: "\u221D",
      vArr: "\u21D5",
      varr: "\u2195",
      varrho: "\u03F1",
      varsigma: "\u03C2",
      varsubsetneq: "\u228A\uFE00",
      varsubsetneqq: "\u2ACB\uFE00",
      varsupsetneq: "\u228B\uFE00",
      varsupsetneqq: "\u2ACC\uFE00",
      vartheta: "\u03D1",
      vartriangleleft: "\u22B2",
      vartriangleright: "\u22B3",
      Vbar: "\u2AEB",
      vBar: "\u2AE8",
      vBarv: "\u2AE9",
      Vcy: "\u0412",
      vcy: "\u0432",
      VDash: "\u22AB",
      Vdash: "\u22A9",
      vDash: "\u22A8",
      vdash: "\u22A2",
      Vdashl: "\u2AE6",
      Vee: "\u22C1",
      vee: "\u2228",
      veebar: "\u22BB",
      veeeq: "\u225A",
      vellip: "\u22EE",
      Verbar: "\u2016",
      verbar: "|",
      Vert: "\u2016",
      vert: "|",
      VerticalBar: "\u2223",
      VerticalLine: "|",
      VerticalSeparator: "\u2758",
      VerticalTilde: "\u2240",
      VeryThinSpace: "\u200A",
      Vfr: "\u{1D519}",
      vfr: "\u{1D533}",
      vltri: "\u22B2",
      vnsub: "\u2282\u20D2",
      vnsup: "\u2283\u20D2",
      Vopf: "\u{1D54D}",
      vopf: "\u{1D567}",
      vprop: "\u221D",
      vrtri: "\u22B3",
      Vscr: "\u{1D4B1}",
      vscr: "\u{1D4CB}",
      vsubnE: "\u2ACB\uFE00",
      vsubne: "\u228A\uFE00",
      vsupnE: "\u2ACC\uFE00",
      vsupne: "\u228B\uFE00",
      Vvdash: "\u22AA",
      vzigzag: "\u299A",
      Wcirc: "\u0174",
      wcirc: "\u0175",
      wedbar: "\u2A5F",
      Wedge: "\u22C0",
      wedge: "\u2227",
      wedgeq: "\u2259",
      weierp: "\u2118",
      Wfr: "\u{1D51A}",
      wfr: "\u{1D534}",
      Wopf: "\u{1D54E}",
      wopf: "\u{1D568}",
      wp: "\u2118",
      wr: "\u2240",
      wreath: "\u2240",
      Wscr: "\u{1D4B2}",
      wscr: "\u{1D4CC}",
      xcap: "\u22C2",
      xcirc: "\u25EF",
      xcup: "\u22C3",
      xdtri: "\u25BD",
      Xfr: "\u{1D51B}",
      xfr: "\u{1D535}",
      xhArr: "\u27FA",
      xharr: "\u27F7",
      Xi: "\u039E",
      xi: "\u03BE",
      xlArr: "\u27F8",
      xlarr: "\u27F5",
      xmap: "\u27FC",
      xnis: "\u22FB",
      xodot: "\u2A00",
      Xopf: "\u{1D54F}",
      xopf: "\u{1D569}",
      xoplus: "\u2A01",
      xotime: "\u2A02",
      xrArr: "\u27F9",
      xrarr: "\u27F6",
      Xscr: "\u{1D4B3}",
      xscr: "\u{1D4CD}",
      xsqcup: "\u2A06",
      xuplus: "\u2A04",
      xutri: "\u25B3",
      xvee: "\u22C1",
      xwedge: "\u22C0",
      Yacute: "\xDD",
      yacute: "\xFD",
      YAcy: "\u042F",
      yacy: "\u044F",
      Ycirc: "\u0176",
      ycirc: "\u0177",
      Ycy: "\u042B",
      ycy: "\u044B",
      yen: "\xA5",
      Yfr: "\u{1D51C}",
      yfr: "\u{1D536}",
      YIcy: "\u0407",
      yicy: "\u0457",
      Yopf: "\u{1D550}",
      yopf: "\u{1D56A}",
      Yscr: "\u{1D4B4}",
      yscr: "\u{1D4CE}",
      YUcy: "\u042E",
      yucy: "\u044E",
      Yuml: "\u0178",
      yuml: "\xFF",
      Zacute: "\u0179",
      zacute: "\u017A",
      Zcaron: "\u017D",
      zcaron: "\u017E",
      Zcy: "\u0417",
      zcy: "\u0437",
      Zdot: "\u017B",
      zdot: "\u017C",
      zeetrf: "\u2128",
      ZeroWidthSpace: "\u200B",
      Zeta: "\u0396",
      zeta: "\u03B6",
      Zfr: "\u2128",
      zfr: "\u{1D537}",
      ZHcy: "\u0416",
      zhcy: "\u0436",
      zigrarr: "\u21DD",
      Zopf: "\u2124",
      zopf: "\u{1D56B}",
      Zscr: "\u{1D4B5}",
      zscr: "\u{1D4CF}",
      zwj: "\u200D",
      zwnj: "\u200C"
    });
    exports.entityMap = exports.HTML_ENTITIES;
  }
});

// node_modules/@xmldom/xmldom/lib/sax.js
var require_sax = __commonJS({
  "node_modules/@xmldom/xmldom/lib/sax.js"(exports) {
    "use strict";
    var conventions = require_conventions();
    var g = require_grammar();
    var errors = require_errors();
    var isHTMLEscapableRawTextElement = conventions.isHTMLEscapableRawTextElement;
    var isHTMLMimeType = conventions.isHTMLMimeType;
    var isHTMLRawTextElement = conventions.isHTMLRawTextElement;
    var hasOwn = conventions.hasOwn;
    var NAMESPACE = conventions.NAMESPACE;
    var ParseError = errors.ParseError;
    var DOMException = errors.DOMException;
    var S_TAG = 0;
    var S_ATTR = 1;
    var S_ATTR_SPACE = 2;
    var S_EQ = 3;
    var S_ATTR_NOQUOT_VALUE = 4;
    var S_ATTR_END = 5;
    var S_TAG_SPACE = 6;
    var S_TAG_CLOSE = 7;
    function XMLReader() {
    }
    XMLReader.prototype = {
      parse: function(source, defaultNSMap, entityMap) {
        var domBuilder = this.domBuilder;
        domBuilder.startDocument();
        _copy(defaultNSMap, defaultNSMap = /* @__PURE__ */ Object.create(null));
        parse(source, defaultNSMap, entityMap, domBuilder, this.errorHandler);
        domBuilder.endDocument();
      }
    };
    var ENTITY_REG = /&#?\w+;?/g;
    function parse(source, defaultNSMapCopy, entityMap, domBuilder, errorHandler) {
      var isHTML = isHTMLMimeType(domBuilder.mimeType);
      if (source.indexOf(g.UNICODE_REPLACEMENT_CHARACTER) >= 0) {
        errorHandler.warning("Unicode replacement character detected, source encoding issues?");
      }
      function fixedFromCharCode(code) {
        if (code > 65535) {
          code -= 65536;
          var surrogate1 = 55296 + (code >> 10), surrogate2 = 56320 + (code & 1023);
          return String.fromCharCode(surrogate1, surrogate2);
        } else {
          return String.fromCharCode(code);
        }
      }
      function entityReplacer(a2) {
        var complete = a2[a2.length - 1] === ";" ? a2 : a2 + ";";
        if (!isHTML && complete !== a2) {
          errorHandler.error("EntityRef: expecting ;");
          return a2;
        }
        var match = g.Reference.exec(complete);
        if (!match || match[0].length !== complete.length) {
          errorHandler.error("entity not matching Reference production: " + a2);
          return a2;
        }
        var k = complete.slice(1, -1);
        if (hasOwn(entityMap, k)) {
          return entityMap[k];
        } else if (k.charAt(0) === "#") {
          return fixedFromCharCode(parseInt(k.substring(1).replace("x", "0x")));
        } else {
          errorHandler.error("entity not found:" + a2);
          return a2;
        }
      }
      function appendText(end2) {
        if (end2 > start) {
          var xt = source.substring(start, end2).replace(ENTITY_REG, entityReplacer);
          locator && position(start);
          domBuilder.characters(xt, 0, end2 - start);
          start = end2;
        }
      }
      var lineStart = 0;
      var lineEnd = 0;
      var linePattern = /\r\n?|\n|$/g;
      var locator = domBuilder.locator;
      function position(p, m) {
        while (p >= lineEnd && (m = linePattern.exec(source))) {
          lineStart = lineEnd;
          lineEnd = m.index + m[0].length;
          locator.lineNumber++;
        }
        locator.columnNumber = p - lineStart + 1;
      }
      var parseStack = [{ currentNSMap: defaultNSMapCopy }];
      var unclosedTags = [];
      var start = 0;
      while (true) {
        try {
          var tagStart = source.indexOf("<", start);
          if (tagStart < 0) {
            if (!isHTML && unclosedTags.length > 0) {
              return errorHandler.fatalError("unclosed xml tag(s): " + unclosedTags.join(", "));
            }
            if (!source.substring(start).match(/^\s*$/)) {
              var doc = domBuilder.doc;
              var text = doc.createTextNode(source.substring(start));
              if (doc.documentElement) {
                return errorHandler.error("Extra content at the end of the document");
              }
              doc.appendChild(text);
              domBuilder.currentElement = text;
            }
            return;
          }
          if (tagStart > start) {
            var fromSource = source.substring(start, tagStart);
            if (!isHTML && unclosedTags.length === 0) {
              fromSource = fromSource.replace(new RegExp(g.S_OPT.source, "g"), "");
              fromSource && errorHandler.error("Unexpected content outside root element: '" + fromSource + "'");
            }
            appendText(tagStart);
          }
          switch (source.charAt(tagStart + 1)) {
            case "/":
              var end = source.indexOf(">", tagStart + 2);
              var tagNameRaw = source.substring(tagStart + 2, end > 0 ? end : void 0);
              if (!tagNameRaw) {
                return errorHandler.fatalError("end tag name missing");
              }
              var tagNameMatch = end > 0 && g.reg("^", g.QName_group, g.S_OPT, "$").exec(tagNameRaw);
              if (!tagNameMatch) {
                return errorHandler.fatalError('end tag name contains invalid characters: "' + tagNameRaw + '"');
              }
              if (!domBuilder.currentElement && !domBuilder.doc.documentElement) {
                return;
              }
              var currentTagName = unclosedTags[unclosedTags.length - 1] || domBuilder.currentElement.tagName || domBuilder.doc.documentElement.tagName || "";
              if (currentTagName !== tagNameMatch[1]) {
                var tagNameLower = tagNameMatch[1].toLowerCase();
                if (!isHTML || currentTagName.toLowerCase() !== tagNameLower) {
                  return errorHandler.fatalError('Opening and ending tag mismatch: "' + currentTagName + '" != "' + tagNameRaw + '"');
                }
              }
              var config = parseStack.pop();
              unclosedTags.pop();
              var localNSMap = config.localNSMap;
              domBuilder.endElement(config.uri, config.localName, currentTagName);
              if (localNSMap) {
                for (var prefix in localNSMap) {
                  if (hasOwn(localNSMap, prefix)) {
                    domBuilder.endPrefixMapping(prefix);
                  }
                }
              }
              end++;
              break;
            // end element
            case "?":
              locator && position(tagStart);
              end = parseProcessingInstruction(source, tagStart, domBuilder, errorHandler);
              break;
            case "!":
              locator && position(tagStart);
              end = parseDoctypeCommentOrCData(source, tagStart, domBuilder, errorHandler, isHTML);
              break;
            default:
              locator && position(tagStart);
              var el = new ElementAttributes();
              var currentNSMap = parseStack[parseStack.length - 1].currentNSMap;
              var end = parseElementStartPart(source, tagStart, el, currentNSMap, entityReplacer, errorHandler, isHTML);
              var len = el.length;
              if (!el.closed) {
                if (isHTML && conventions.isHTMLVoidElement(el.tagName)) {
                  el.closed = true;
                } else {
                  unclosedTags.push(el.tagName);
                }
              }
              if (locator && len) {
                var locator2 = copyLocator(locator, {});
                for (var i = 0; i < len; i++) {
                  var a = el[i];
                  position(a.offset);
                  a.locator = copyLocator(locator, {});
                }
                domBuilder.locator = locator2;
                if (appendElement(el, domBuilder, currentNSMap)) {
                  parseStack.push(el);
                }
                domBuilder.locator = locator;
              } else {
                if (appendElement(el, domBuilder, currentNSMap)) {
                  parseStack.push(el);
                }
              }
              if (isHTML && !el.closed) {
                end = parseHtmlSpecialContent(source, end, el.tagName, entityReplacer, domBuilder);
              } else {
                end++;
              }
          }
        } catch (e) {
          if (e instanceof ParseError) {
            throw e;
          } else if (e instanceof DOMException) {
            throw new ParseError(e.name + ": " + e.message, domBuilder.locator, e);
          }
          errorHandler.error("element parse error: " + e);
          end = -1;
        }
        if (end > start) {
          start = end;
        } else {
          appendText(Math.max(tagStart, start) + 1);
        }
      }
    }
    function copyLocator(f, t) {
      t.lineNumber = f.lineNumber;
      t.columnNumber = f.columnNumber;
      return t;
    }
    function parseElementStartPart(source, start, el, currentNSMap, entityReplacer, errorHandler, isHTML) {
      function addAttribute(qname, value2, startIndex) {
        if (hasOwn(el.attributeNames, qname)) {
          return errorHandler.fatalError("Attribute " + qname + " redefined");
        }
        if (!isHTML && value2.indexOf("<") >= 0) {
          return errorHandler.fatalError("Unescaped '<' not allowed in attributes values");
        }
        el.addValue(
          qname,
          // @see https://www.w3.org/TR/xml/#AVNormalize
          // since the xmldom sax parser does not "interpret" DTD the following is not implemented:
          // - recursive replacement of (DTD) entity references
          // - trimming and collapsing multiple spaces into a single one for attributes that are not of type CDATA
          value2.replace(/[\t\n\r]/g, " ").replace(ENTITY_REG, entityReplacer),
          startIndex
        );
      }
      var attrName;
      var value;
      var p = ++start;
      var s = S_TAG;
      while (true) {
        var c = source.charAt(p);
        switch (c) {
          case "=":
            if (s === S_ATTR) {
              attrName = source.slice(start, p);
              s = S_EQ;
            } else if (s === S_ATTR_SPACE) {
              s = S_EQ;
            } else {
              throw new Error("attribute equal must after attrName");
            }
            break;
          case "'":
          case '"':
            if (s === S_EQ || s === S_ATTR) {
              if (s === S_ATTR) {
                errorHandler.warning('attribute value must after "="');
                attrName = source.slice(start, p);
              }
              start = p + 1;
              p = source.indexOf(c, start);
              if (p > 0) {
                value = source.slice(start, p);
                addAttribute(attrName, value, start - 1);
                s = S_ATTR_END;
              } else {
                throw new Error("attribute value no end '" + c + "' match");
              }
            } else if (s == S_ATTR_NOQUOT_VALUE) {
              value = source.slice(start, p);
              addAttribute(attrName, value, start);
              errorHandler.warning('attribute "' + attrName + '" missed start quot(' + c + ")!!");
              start = p + 1;
              s = S_ATTR_END;
            } else {
              throw new Error('attribute value must after "="');
            }
            break;
          case "/":
            switch (s) {
              case S_TAG:
                el.setTagName(source.slice(start, p));
              case S_ATTR_END:
              case S_TAG_SPACE:
              case S_TAG_CLOSE:
                s = S_TAG_CLOSE;
                el.closed = true;
              case S_ATTR_NOQUOT_VALUE:
              case S_ATTR:
                break;
              case S_ATTR_SPACE:
                el.closed = true;
                break;
              //case S_EQ:
              default:
                throw new Error("attribute invalid close char('/')");
            }
            break;
          case "":
            errorHandler.error("unexpected end of input");
            if (s == S_TAG) {
              el.setTagName(source.slice(start, p));
            }
            return p;
          case ">":
            switch (s) {
              case S_TAG:
                el.setTagName(source.slice(start, p));
              case S_ATTR_END:
              case S_TAG_SPACE:
              case S_TAG_CLOSE:
                break;
              //normal
              case S_ATTR_NOQUOT_VALUE:
              //Compatible state
              case S_ATTR:
                value = source.slice(start, p);
                if (value.slice(-1) === "/") {
                  el.closed = true;
                  value = value.slice(0, -1);
                }
              case S_ATTR_SPACE:
                if (s === S_ATTR_SPACE) {
                  value = attrName;
                }
                if (s == S_ATTR_NOQUOT_VALUE) {
                  errorHandler.warning('attribute "' + value + '" missed quot(")!');
                  addAttribute(attrName, value, start);
                } else {
                  if (!isHTML) {
                    errorHandler.warning('attribute "' + value + '" missed value!! "' + value + '" instead!!');
                  }
                  addAttribute(value, value, start);
                }
                break;
              case S_EQ:
                if (!isHTML) {
                  return errorHandler.fatalError(`AttValue: ' or " expected`);
                }
            }
            return p;
          /*xml space '\x20' | #x9 | #xD | #xA; */
          case "\x80":
            c = " ";
          default:
            if (c <= " ") {
              switch (s) {
                case S_TAG:
                  el.setTagName(source.slice(start, p));
                  s = S_TAG_SPACE;
                  break;
                case S_ATTR:
                  attrName = source.slice(start, p);
                  s = S_ATTR_SPACE;
                  break;
                case S_ATTR_NOQUOT_VALUE:
                  var value = source.slice(start, p);
                  errorHandler.warning('attribute "' + value + '" missed quot(")!!');
                  addAttribute(attrName, value, start);
                case S_ATTR_END:
                  s = S_TAG_SPACE;
                  break;
              }
            } else {
              switch (s) {
                //case S_TAG:void();break;
                //case S_ATTR:void();break;
                //case S_ATTR_NOQUOT_VALUE:void();break;
                case S_ATTR_SPACE:
                  if (!isHTML) {
                    errorHandler.warning('attribute "' + attrName + '" missed value!! "' + attrName + '" instead2!!');
                  }
                  addAttribute(attrName, attrName, start);
                  start = p;
                  s = S_ATTR;
                  break;
                case S_ATTR_END:
                  errorHandler.warning('attribute space is required"' + attrName + '"!!');
                case S_TAG_SPACE:
                  s = S_ATTR;
                  start = p;
                  break;
                case S_EQ:
                  s = S_ATTR_NOQUOT_VALUE;
                  start = p;
                  break;
                case S_TAG_CLOSE:
                  throw new Error("elements closed character '/' and '>' must be connected to");
              }
            }
        }
        p++;
      }
    }
    function appendElement(el, domBuilder, currentNSMap) {
      var tagName = el.tagName;
      var localNSMap = null;
      var i = el.length;
      while (i--) {
        var a = el[i];
        var qName = a.qName;
        var value = a.value;
        var nsp = qName.indexOf(":");
        if (nsp > 0) {
          var prefix = a.prefix = qName.slice(0, nsp);
          var localName = qName.slice(nsp + 1);
          var nsPrefix = prefix === "xmlns" && localName;
        } else {
          localName = qName;
          prefix = null;
          nsPrefix = qName === "xmlns" && "";
        }
        a.localName = localName;
        if (nsPrefix !== false) {
          if (localNSMap == null) {
            localNSMap = /* @__PURE__ */ Object.create(null);
            _copy(currentNSMap, currentNSMap = /* @__PURE__ */ Object.create(null));
          }
          currentNSMap[nsPrefix] = localNSMap[nsPrefix] = value;
          a.uri = NAMESPACE.XMLNS;
          domBuilder.startPrefixMapping(nsPrefix, value);
        }
      }
      var i = el.length;
      while (i--) {
        a = el[i];
        if (a.prefix) {
          if (a.prefix === "xml") {
            a.uri = NAMESPACE.XML;
          }
          if (a.prefix !== "xmlns") {
            a.uri = currentNSMap[a.prefix];
          }
        }
      }
      var nsp = tagName.indexOf(":");
      if (nsp > 0) {
        prefix = el.prefix = tagName.slice(0, nsp);
        localName = el.localName = tagName.slice(nsp + 1);
      } else {
        prefix = null;
        localName = el.localName = tagName;
      }
      var ns = el.uri = currentNSMap[prefix || ""];
      domBuilder.startElement(ns, localName, tagName, el);
      if (el.closed) {
        domBuilder.endElement(ns, localName, tagName);
        if (localNSMap) {
          for (prefix in localNSMap) {
            if (hasOwn(localNSMap, prefix)) {
              domBuilder.endPrefixMapping(prefix);
            }
          }
        }
      } else {
        el.currentNSMap = currentNSMap;
        el.localNSMap = localNSMap;
        return true;
      }
    }
    function parseHtmlSpecialContent(source, elStartEnd, tagName, entityReplacer, domBuilder) {
      var isEscapableRaw = isHTMLEscapableRawTextElement(tagName);
      if (isEscapableRaw || isHTMLRawTextElement(tagName)) {
        var elEndStart = source.indexOf("</" + tagName + ">", elStartEnd);
        var text = source.substring(elStartEnd + 1, elEndStart);
        if (isEscapableRaw) {
          text = text.replace(ENTITY_REG, entityReplacer);
        }
        domBuilder.characters(text, 0, text.length);
        return elEndStart;
      }
      return elStartEnd + 1;
    }
    function _copy(source, target2) {
      for (var n in source) {
        if (hasOwn(source, n)) {
          target2[n] = source[n];
        }
      }
    }
    function parseUtils(source, start) {
      var index = start;
      function char(n) {
        n = n || 0;
        return source.charAt(index + n);
      }
      function skip(n) {
        n = n || 1;
        index += n;
      }
      function skipBlanks() {
        var blanks = 0;
        while (index < source.length) {
          var c = char();
          if (c !== " " && c !== "\n" && c !== "	" && c !== "\r") {
            return blanks;
          }
          blanks++;
          skip();
        }
        return -1;
      }
      function substringFromIndex() {
        return source.substring(index);
      }
      function substringStartsWith(text) {
        return source.substring(index, index + text.length) === text;
      }
      function substringStartsWithCaseInsensitive(text) {
        return source.substring(index, index + text.length).toUpperCase() === text.toUpperCase();
      }
      function getMatch(args) {
        var expr = g.reg("^", args);
        var match = expr.exec(substringFromIndex());
        if (match) {
          skip(match[0].length);
          return match[0];
        }
        return null;
      }
      return {
        char,
        getIndex: function() {
          return index;
        },
        getMatch,
        getSource: function() {
          return source;
        },
        skip,
        skipBlanks,
        substringFromIndex,
        substringStartsWith,
        substringStartsWithCaseInsensitive
      };
    }
    function parseDoctypeInternalSubset(p, errorHandler) {
      function parsePI(p2, errorHandler2) {
        var match = g.PI.exec(p2.substringFromIndex());
        if (!match) {
          return errorHandler2.fatalError("processing instruction is not well-formed at position " + p2.getIndex());
        }
        if (match[1].toLowerCase() === "xml") {
          return errorHandler2.fatalError(
            "xml declaration is only allowed at the start of the document, but found at position " + p2.getIndex()
          );
        }
        p2.skip(match[0].length);
        return match[0];
      }
      var source = p.getSource();
      if (p.char() === "[") {
        p.skip(1);
        var intSubsetStart = p.getIndex();
        while (p.getIndex() < source.length) {
          p.skipBlanks();
          if (p.char() === "]") {
            var internalSubset = source.substring(intSubsetStart, p.getIndex());
            p.skip(1);
            return internalSubset;
          }
          var current = null;
          if (p.char() === "<" && p.char(1) === "!") {
            switch (p.char(2)) {
              case "E":
                if (p.char(3) === "L") {
                  current = p.getMatch(g.elementdecl);
                } else if (p.char(3) === "N") {
                  current = p.getMatch(g.EntityDecl);
                }
                break;
              case "A":
                current = p.getMatch(g.AttlistDecl);
                break;
              case "N":
                current = p.getMatch(g.NotationDecl);
                break;
              case "-":
                current = p.getMatch(g.Comment);
                break;
            }
          } else if (p.char() === "<" && p.char(1) === "?") {
            current = parsePI(p, errorHandler);
          } else if (p.char() === "%") {
            current = p.getMatch(g.PEReference);
          } else {
            return errorHandler.fatalError("Error detected in Markup declaration");
          }
          if (!current) {
            return errorHandler.fatalError("Error in internal subset at position " + p.getIndex());
          }
        }
        return errorHandler.fatalError("doctype internal subset is not well-formed, missing ]");
      }
    }
    function parseDoctypeCommentOrCData(source, start, domBuilder, errorHandler, isHTML) {
      var p = parseUtils(source, start);
      switch (isHTML ? p.char(2).toUpperCase() : p.char(2)) {
        case "-":
          var comment = p.getMatch(g.Comment);
          if (comment) {
            domBuilder.comment(comment, g.COMMENT_START.length, comment.length - g.COMMENT_START.length - g.COMMENT_END.length);
            return p.getIndex();
          } else {
            return errorHandler.fatalError("comment is not well-formed at position " + p.getIndex());
          }
        case "[":
          var cdata = p.getMatch(g.CDSect);
          if (cdata) {
            if (!isHTML && !domBuilder.currentElement) {
              return errorHandler.fatalError("CDATA outside of element");
            }
            domBuilder.startCDATA();
            domBuilder.characters(cdata, g.CDATA_START.length, cdata.length - g.CDATA_START.length - g.CDATA_END.length);
            domBuilder.endCDATA();
            return p.getIndex();
          } else {
            return errorHandler.fatalError("Invalid CDATA starting at position " + start);
          }
        case "D": {
          if (domBuilder.doc && domBuilder.doc.documentElement) {
            return errorHandler.fatalError("Doctype not allowed inside or after documentElement at position " + p.getIndex());
          }
          if (isHTML ? !p.substringStartsWithCaseInsensitive(g.DOCTYPE_DECL_START) : !p.substringStartsWith(g.DOCTYPE_DECL_START)) {
            return errorHandler.fatalError("Expected " + g.DOCTYPE_DECL_START + " at position " + p.getIndex());
          }
          p.skip(g.DOCTYPE_DECL_START.length);
          if (p.skipBlanks() < 1) {
            return errorHandler.fatalError("Expected whitespace after " + g.DOCTYPE_DECL_START + " at position " + p.getIndex());
          }
          var doctype = {
            name: void 0,
            publicId: void 0,
            systemId: void 0,
            internalSubset: void 0
          };
          doctype.name = p.getMatch(g.Name);
          if (!doctype.name)
            return errorHandler.fatalError("doctype name missing or contains unexpected characters at position " + p.getIndex());
          if (isHTML && doctype.name.toLowerCase() !== "html") {
            errorHandler.warning("Unexpected DOCTYPE in HTML document at position " + p.getIndex());
          }
          p.skipBlanks();
          if (p.substringStartsWith(g.PUBLIC) || p.substringStartsWith(g.SYSTEM)) {
            var match = g.ExternalID_match.exec(p.substringFromIndex());
            if (!match) {
              return errorHandler.fatalError("doctype external id is not well-formed at position " + p.getIndex());
            }
            if (match.groups.SystemLiteralOnly !== void 0) {
              doctype.systemId = match.groups.SystemLiteralOnly;
            } else {
              doctype.systemId = match.groups.SystemLiteral;
              doctype.publicId = match.groups.PubidLiteral;
            }
            p.skip(match[0].length);
          } else if (isHTML && p.substringStartsWithCaseInsensitive(g.SYSTEM)) {
            p.skip(g.SYSTEM.length);
            if (p.skipBlanks() < 1) {
              return errorHandler.fatalError("Expected whitespace after " + g.SYSTEM + " at position " + p.getIndex());
            }
            doctype.systemId = p.getMatch(g.ABOUT_LEGACY_COMPAT_SystemLiteral);
            if (!doctype.systemId) {
              return errorHandler.fatalError(
                "Expected " + g.ABOUT_LEGACY_COMPAT + " in single or double quotes after " + g.SYSTEM + " at position " + p.getIndex()
              );
            }
          }
          if (isHTML && doctype.systemId && !g.ABOUT_LEGACY_COMPAT_SystemLiteral.test(doctype.systemId)) {
            errorHandler.warning("Unexpected doctype.systemId in HTML document at position " + p.getIndex());
          }
          if (!isHTML) {
            p.skipBlanks();
            doctype.internalSubset = parseDoctypeInternalSubset(p, errorHandler);
          }
          p.skipBlanks();
          if (p.char() !== ">") {
            return errorHandler.fatalError("doctype not terminated with > at position " + p.getIndex());
          }
          p.skip(1);
          domBuilder.startDTD(doctype.name, doctype.publicId, doctype.systemId, doctype.internalSubset);
          domBuilder.endDTD();
          return p.getIndex();
        }
        default:
          return errorHandler.fatalError('Not well-formed XML starting with "<!" at position ' + start);
      }
    }
    function parseProcessingInstruction(source, start, domBuilder, errorHandler) {
      var match = source.substring(start).match(g.PI);
      if (!match) {
        return errorHandler.fatalError("Invalid processing instruction starting at position " + start);
      }
      if (match[1].toLowerCase() === "xml") {
        if (start > 0) {
          return errorHandler.fatalError(
            "processing instruction at position " + start + " is an xml declaration which is only at the start of the document"
          );
        }
        if (!g.XMLDecl.test(source.substring(start))) {
          return errorHandler.fatalError("xml declaration is not well-formed");
        }
      }
      domBuilder.processingInstruction(match[1], match[2]);
      return start + match[0].length;
    }
    function ElementAttributes() {
      this.attributeNames = /* @__PURE__ */ Object.create(null);
    }
    ElementAttributes.prototype = {
      setTagName: function(tagName) {
        if (!g.QName_exact.test(tagName)) {
          throw new Error("invalid tagName:" + tagName);
        }
        this.tagName = tagName;
      },
      addValue: function(qName, value, offset) {
        if (!g.QName_exact.test(qName)) {
          throw new Error("invalid attribute:" + qName);
        }
        this.attributeNames[qName] = this.length;
        this[this.length++] = { qName, value, offset };
      },
      length: 0,
      getLocalName: function(i) {
        return this[i].localName;
      },
      getLocator: function(i) {
        return this[i].locator;
      },
      getQName: function(i) {
        return this[i].qName;
      },
      getURI: function(i) {
        return this[i].uri;
      },
      getValue: function(i) {
        return this[i].value;
      }
      //	,getIndex:function(uri, localName)){
      //		if(localName){
      //
      //		}else{
      //			var qName = uri
      //		}
      //	},
      //	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
      //	getType:function(uri,localName){}
      //	getType:function(i){},
    };
    exports.XMLReader = XMLReader;
    exports.parseUtils = parseUtils;
    exports.parseDoctypeCommentOrCData = parseDoctypeCommentOrCData;
  }
});

// node_modules/@xmldom/xmldom/lib/dom-parser.js
var require_dom_parser = __commonJS({
  "node_modules/@xmldom/xmldom/lib/dom-parser.js"(exports) {
    "use strict";
    var conventions = require_conventions();
    var dom = require_dom();
    var errors = require_errors();
    var entities = require_entities();
    var sax = require_sax();
    var DOMImplementation = dom.DOMImplementation;
    var hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
    var isHTMLMimeType = conventions.isHTMLMimeType;
    var isValidMimeType = conventions.isValidMimeType;
    var MIME_TYPE = conventions.MIME_TYPE;
    var NAMESPACE = conventions.NAMESPACE;
    var ParseError = errors.ParseError;
    var XMLReader = sax.XMLReader;
    function normalizeLineEndings(input) {
      return input.replace(/\r[\n\u0085]/g, "\n").replace(/[\r\u0085\u2028\u2029]/g, "\n");
    }
    function DOMParser2(options) {
      options = options || {};
      if (options.locator === void 0) {
        options.locator = true;
      }
      this.assign = options.assign || conventions.assign;
      this.domHandler = options.domHandler || DOMHandler;
      this.onError = options.onError || options.errorHandler;
      if (options.errorHandler && typeof options.errorHandler !== "function") {
        throw new TypeError("errorHandler object is no longer supported, switch to onError!");
      } else if (options.errorHandler) {
        options.errorHandler("warning", "The `errorHandler` option has been deprecated, use `onError` instead!", this);
      }
      this.normalizeLineEndings = options.normalizeLineEndings || normalizeLineEndings;
      this.locator = !!options.locator;
      this.xmlns = this.assign(/* @__PURE__ */ Object.create(null), options.xmlns);
    }
    DOMParser2.prototype.parseFromString = function(source, mimeType) {
      if (!isValidMimeType(mimeType)) {
        throw new TypeError('DOMParser.parseFromString: the provided mimeType "' + mimeType + '" is not valid.');
      }
      var defaultNSMap = this.assign(/* @__PURE__ */ Object.create(null), this.xmlns);
      var entityMap = entities.XML_ENTITIES;
      var defaultNamespace = defaultNSMap[""] || null;
      if (hasDefaultHTMLNamespace(mimeType)) {
        entityMap = entities.HTML_ENTITIES;
        defaultNamespace = NAMESPACE.HTML;
      } else if (mimeType === MIME_TYPE.XML_SVG_IMAGE) {
        defaultNamespace = NAMESPACE.SVG;
      }
      defaultNSMap[""] = defaultNamespace;
      defaultNSMap.xml = defaultNSMap.xml || NAMESPACE.XML;
      var domBuilder = new this.domHandler({
        mimeType,
        defaultNamespace,
        onError: this.onError
      });
      var locator = this.locator ? {} : void 0;
      if (this.locator) {
        domBuilder.setDocumentLocator(locator);
      }
      var sax2 = new XMLReader();
      sax2.errorHandler = domBuilder;
      sax2.domBuilder = domBuilder;
      var isXml = !conventions.isHTMLMimeType(mimeType);
      if (isXml && typeof source !== "string") {
        sax2.errorHandler.fatalError("source is not a string");
      }
      sax2.parse(this.normalizeLineEndings(String(source)), defaultNSMap, entityMap);
      if (!domBuilder.doc.documentElement) {
        sax2.errorHandler.fatalError("missing root element");
      }
      return domBuilder.doc;
    };
    function DOMHandler(options) {
      var opt = options || {};
      this.mimeType = opt.mimeType || MIME_TYPE.XML_APPLICATION;
      this.defaultNamespace = opt.defaultNamespace || null;
      this.cdata = false;
      this.currentElement = void 0;
      this.doc = void 0;
      this.locator = void 0;
      this.onError = opt.onError;
    }
    function position(locator, node) {
      node.lineNumber = locator.lineNumber;
      node.columnNumber = locator.columnNumber;
    }
    DOMHandler.prototype = {
      /**
       * Either creates an XML or an HTML document and stores it under `this.doc`.
       * If it is an XML document, `this.defaultNamespace` is used to create it,
       * and it will not contain any `childNodes`.
       * If it is an HTML document, it will be created without any `childNodes`.
       *
       * @see http://www.saxproject.org/apidoc/org/xml/sax/ContentHandler.html
       */
      startDocument: function() {
        var impl = new DOMImplementation();
        this.doc = isHTMLMimeType(this.mimeType) ? impl.createHTMLDocument(false) : impl.createDocument(this.defaultNamespace, "");
      },
      startElement: function(namespaceURI, localName, qName, attrs) {
        var doc = this.doc;
        var el = doc.createElementNS(namespaceURI, qName || localName);
        var len = attrs.length;
        appendElement(this, el);
        this.currentElement = el;
        this.locator && position(this.locator, el);
        for (var i = 0; i < len; i++) {
          var namespaceURI = attrs.getURI(i);
          var value = attrs.getValue(i);
          var qName = attrs.getQName(i);
          var attr = doc.createAttributeNS(namespaceURI, qName);
          this.locator && position(attrs.getLocator(i), attr);
          attr.value = attr.nodeValue = value;
          el.setAttributeNode(attr);
        }
      },
      endElement: function(namespaceURI, localName, qName) {
        this.currentElement = this.currentElement.parentNode;
      },
      startPrefixMapping: function(prefix, uri) {
      },
      endPrefixMapping: function(prefix) {
      },
      processingInstruction: function(target2, data) {
        var ins = this.doc.createProcessingInstruction(target2, data);
        this.locator && position(this.locator, ins);
        appendElement(this, ins);
      },
      ignorableWhitespace: function(ch, start, length) {
      },
      characters: function(chars, start, length) {
        chars = _toString.apply(this, arguments);
        if (chars) {
          if (this.cdata) {
            var charNode = this.doc.createCDATASection(chars);
          } else {
            var charNode = this.doc.createTextNode(chars);
          }
          if (this.currentElement) {
            this.currentElement.appendChild(charNode);
          } else if (/^\s*$/.test(chars)) {
            this.doc.appendChild(charNode);
          }
          this.locator && position(this.locator, charNode);
        }
      },
      skippedEntity: function(name) {
      },
      endDocument: function() {
        this.doc.normalize();
      },
      /**
       * Stores the locator to be able to set the `columnNumber` and `lineNumber`
       * on the created DOM nodes.
       *
       * @param {Locator} locator
       */
      setDocumentLocator: function(locator) {
        if (locator) {
          locator.lineNumber = 0;
        }
        this.locator = locator;
      },
      //LexicalHandler
      comment: function(chars, start, length) {
        chars = _toString.apply(this, arguments);
        var comm = this.doc.createComment(chars);
        this.locator && position(this.locator, comm);
        appendElement(this, comm);
      },
      startCDATA: function() {
        this.cdata = true;
      },
      endCDATA: function() {
        this.cdata = false;
      },
      startDTD: function(name, publicId, systemId, internalSubset) {
        var impl = this.doc.implementation;
        if (impl && impl.createDocumentType) {
          var dt = impl.createDocumentType(name, publicId, systemId, internalSubset);
          this.locator && position(this.locator, dt);
          appendElement(this, dt);
          this.doc.doctype = dt;
        }
      },
      reportError: function(level, message) {
        if (typeof this.onError === "function") {
          try {
            this.onError(level, message, this);
          } catch (e) {
            throw new ParseError("Reporting " + level + ' "' + message + '" caused ' + e, this.locator);
          }
        } else {
          console.error("[xmldom " + level + "]	" + message, _locator(this.locator));
        }
      },
      /**
       * @see http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
       */
      warning: function(message) {
        this.reportError("warning", message);
      },
      error: function(message) {
        this.reportError("error", message);
      },
      /**
       * This function reports a fatal error and throws a ParseError.
       *
       * @param {string} message
       * - The message to be used for reporting and throwing the error.
       * @returns {never}
       * This function always throws an error and never returns a value.
       * @throws {ParseError}
       * Always throws a ParseError with the provided message.
       */
      fatalError: function(message) {
        this.reportError("fatalError", message);
        throw new ParseError(message, this.locator);
      }
    };
    function _locator(l) {
      if (l) {
        return "\n@#[line:" + l.lineNumber + ",col:" + l.columnNumber + "]";
      }
    }
    function _toString(chars, start, length) {
      if (typeof chars == "string") {
        return chars.substr(start, length);
      } else {
        if (chars.length >= start + length || start) {
          return new java.lang.String(chars, start, length) + "";
        }
        return chars;
      }
    }
    "endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(
      /\w+/g,
      function(key) {
        DOMHandler.prototype[key] = function() {
          return null;
        };
      }
    );
    function appendElement(handler, node) {
      if (!handler.currentElement) {
        handler.doc.appendChild(node);
      } else {
        handler.currentElement.appendChild(node);
      }
    }
    function onErrorStopParsing(level) {
      if (level === "error") throw "onErrorStopParsing";
    }
    function onWarningStopParsing() {
      throw "onWarningStopParsing";
    }
    exports.__DOMHandler = DOMHandler;
    exports.DOMParser = DOMParser2;
    exports.normalizeLineEndings = normalizeLineEndings;
    exports.onErrorStopParsing = onErrorStopParsing;
    exports.onWarningStopParsing = onWarningStopParsing;
  }
});

// node_modules/@xmldom/xmldom/lib/index.js
var require_lib = __commonJS({
  "node_modules/@xmldom/xmldom/lib/index.js"(exports) {
    "use strict";
    var conventions = require_conventions();
    exports.assign = conventions.assign;
    exports.hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
    exports.isHTMLMimeType = conventions.isHTMLMimeType;
    exports.isValidMimeType = conventions.isValidMimeType;
    exports.MIME_TYPE = conventions.MIME_TYPE;
    exports.NAMESPACE = conventions.NAMESPACE;
    var errors = require_errors();
    exports.DOMException = errors.DOMException;
    exports.DOMExceptionName = errors.DOMExceptionName;
    exports.ExceptionCode = errors.ExceptionCode;
    exports.ParseError = errors.ParseError;
    var dom = require_dom();
    exports.Attr = dom.Attr;
    exports.CDATASection = dom.CDATASection;
    exports.CharacterData = dom.CharacterData;
    exports.Comment = dom.Comment;
    exports.Document = dom.Document;
    exports.DocumentFragment = dom.DocumentFragment;
    exports.DocumentType = dom.DocumentType;
    exports.DOMImplementation = dom.DOMImplementation;
    exports.Element = dom.Element;
    exports.Entity = dom.Entity;
    exports.EntityReference = dom.EntityReference;
    exports.LiveNodeList = dom.LiveNodeList;
    exports.NamedNodeMap = dom.NamedNodeMap;
    exports.Node = dom.Node;
    exports.NodeList = dom.NodeList;
    exports.Notation = dom.Notation;
    exports.ProcessingInstruction = dom.ProcessingInstruction;
    exports.Text = dom.Text;
    exports.XMLSerializer = dom.XMLSerializer;
    var domParser = require_dom_parser();
    exports.DOMParser = domParser.DOMParser;
    exports.normalizeLineEndings = domParser.normalizeLineEndings;
    exports.onErrorStopParsing = domParser.onErrorStopParsing;
    exports.onWarningStopParsing = domParser.onWarningStopParsing;
  }
});

// core/src/aio-dispatcher.ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
function pluginRoot() {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  const entry = process.argv[1];
  if (!entry) return process.cwd();
  return resolve(dirname(entry), "../..");
}
function matches(matcher, name) {
  if (!matcher) return true;
  try {
    return new RegExp(`^(?:${matcher})$`, "u").test(name);
  } catch {
    return false;
  }
}
function parseEvent(raw) {
  try {
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return isRecord(parsed) ? parsed : {};
  } catch {
    return { __parseError: true };
  }
}
function combinedOutput(eventName2, outputs) {
  for (const output of outputs) {
    if (output.decision === "block" || output.hookSpecificOutput?.permissionDecision === "deny") return output;
  }
  const codexFeedback = outputs.filter((output) => output.continue === false && Boolean(output.reason));
  if (codexFeedback.length > 0) {
    return {
      continue: false,
      stopReason: codexFeedback.map((output) => output.stopReason).filter(Boolean).join("\n") || "Plugin review feedback replaced the ordinary tool success output.",
      reason: codexFeedback.map((output) => output.reason).filter(Boolean).join("\n\n")
    };
  }
  const contexts = outputs.map((output) => output.hookSpecificOutput?.additionalContext).filter((context) => Boolean(context));
  if (contexts.length === 0) return null;
  return { hookSpecificOutput: { hookEventName: eventName2, additionalContext: contexts.join("\n\n") } };
}
async function withTimeout(operation, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function dispatchHookRoutes(input) {
  const event = parseEvent(input.raw);
  const name = input.eventName === "SessionStart" ? String(event.source ?? "startup") : String(event.tool_name ?? event.toolName ?? "");
  const outputs = [];
  const failures = [];
  for (const route of input.routes[input.eventName] ?? []) {
    if (event.__parseError !== true && !matches(route.matcher, name)) continue;
    const handler = input.handlers[route.handler];
    if (!handler) {
      failures.push(`${route.handler}: owner handler is not registered`);
      continue;
    }
    const trigger = route.trigger ?? `${input.host}:${input.eventName}`;
    try {
      const value = await withTimeout(
        Promise.resolve(handler({
          args: route.args ?? [],
          event,
          eventName: input.eventName,
          host: input.host,
          raw: input.raw,
          trigger
        })),
        route.timeoutMs ?? 6e4,
        route.handler
      );
      if (Array.isArray(value)) outputs.push(...value);
      else if (value) outputs.push(value);
      const output = combinedOutput(input.eventName, outputs);
      if (output?.decision === "block" || output?.hookSpecificOutput?.permissionDecision === "deny") return { output, failures };
    } catch (error) {
      failures.push(`${route.handler}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { output: combinedOutput(input.eventName, outputs), failures };
}
async function runOwnerDispatcher(host2, eventName2, handlers) {
  const root = pluginRoot();
  const raw = readFileSync(0, "utf8");
  let routes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", `${host2}.json`), "utf8"));
  } catch (error) {
    process.stderr.write(`[aio-dispatcher] unable to load ${host2} routes: ${String(error)}
`);
    return;
  }
  const { output, failures } = await dispatchHookRoutes({ eventName: eventName2, handlers, host: host2, raw, routes });
  for (const failure of failures) process.stderr.write(`[aio-dispatcher] ${failure}
`);
  if (output) process.stdout.write(`${JSON.stringify(output)}
`);
  else if (failures.length > 0) process.exitCode = 1;
}

// core/src/domain-engineering-hook.ts
var import_xmldom = __toESM(require_lib(), 1);
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync as readFileSync3, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname as dirname2, isAbsolute, join as join2, relative, resolve as resolve3 } from "node:path";
import { pathToFileURL } from "node:url";

// core/src/domain-engineering-debt.ts
import { readFileSync as readFileSync2, rmSync } from "node:fs";
import { join, resolve as resolve2 } from "node:path";
function formatDomainDebtGuard(displayName, debts) {
  return [
    `[Domain Completion Guard] ${displayName} has unresolved deterministic check debt.`,
    ...debts.map((debt) => `- ${debt.check}: ${debt.path} \u2014 ${debt.message}`),
    "Fix or remove the affected file, rerun the relevant write/check, then finish again."
  ].join("\n");
}
function pluginDataRoot() {
  return process.env.HARNESS_HOST === "codex" ? process.env.PLUGIN_DATA || "" : process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA || "";
}
function stateLocation(root, session) {
  const dataRoot = pluginDataRoot();
  if (!dataRoot || !session || session === "hook" || session === "unknown") return null;
  const rootDigest = digestKey(resolve2(root));
  const sessionDigest = digestKey(session);
  return {
    path: join(dataRoot, "domain-engineering-debt", `${digestKey(`${rootDigest}\0${sessionDigest}`)}.json`),
    rootDigest,
    sessionDigest
  };
}
function readState(location) {
  try {
    const parsed = JSON.parse(readFileSync2(location.path, "utf8"));
    if (!isRecord(parsed) || parsed.schema !== "harness-start/domain-engineering-debt/v1" || parsed.rootDigest !== location.rootDigest || parsed.sessionDigest !== location.sessionDigest || !Array.isArray(parsed.debts)) throw new Error("invalid debt state");
    const debts = parsed.debts.flatMap((value) => {
      if (!isRecord(value) || typeof value.plugin !== "string" || typeof value.check !== "string" || value.kind !== "scan" && value.kind !== "validator" || typeof value.path !== "string" || typeof value.message !== "string") return [];
      return [{ plugin: value.plugin, check: value.check, kind: value.kind, path: value.path, message: value.message }];
    });
    return { schema: "harness-start/domain-engineering-debt/v1", rootDigest: location.rootDigest, sessionDigest: location.sessionDigest, debts };
  } catch {
    return { schema: "harness-start/domain-engineering-debt/v1", rootDigest: location.rootDigest, sessionDigest: location.sessionDigest, debts: [] };
  }
}
function mutate(root, session, operation) {
  const location = stateLocation(root, session);
  if (!location) return false;
  try {
    return withPathLock(location.path, () => {
      const state = readState(location);
      const debts = operation(state.debts);
      if (debts.length === 0) {
        rmSync(location.path, { force: true });
        return true;
      }
      return atomicWriteJson(location.path, { ...state, debts });
    });
  } catch {
    return false;
  }
}
function debtKey(debt) {
  return `${debt.plugin}\0${debt.check}\0${debt.kind}\0${debt.path}`;
}
function readPolicyDebts(root, session, plugin) {
  const location = stateLocation(root, session);
  if (!location) return [];
  return readState(location).debts.filter((debt) => debt.plugin === plugin);
}
function synchronizePolicyDebts(options) {
  if (!options.session) return;
  const evaluated = new Set(options.evaluated.map(debtKey));
  const failed = new Map(options.failed.map((debt) => [debtKey(debt), debt]));
  mutate(options.root, options.session, (debts) => {
    const retained = debts.filter((debt) => debt.plugin !== options.plugin || !evaluated.has(debtKey(debt)) && !options.deletedPaths?.has(debt.path));
    return [...retained, ...failed.values()].toSorted((left, right) => debtKey(left).localeCompare(debtKey(right)));
  });
}

// core/src/hook-output.ts
var TOOL_LIFECYCLE_EVENTS = /* @__PURE__ */ new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure"
]);
function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function additionalContext(hookEventName, context, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context}
`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context
    }
  };
}
function stopBlock(reason) {
  return { decision: "block", reason };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    if (collectOwnerHookOutput(value)) return;
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/shell-parse.ts
function decodeAnsiCQuoteEscape(command, slashIndex) {
  const marker = command[slashIndex + 1] ?? "";
  const simple = /* @__PURE__ */ new Map([
    ["a", "\x07"],
    ["b", "\b"],
    ["e", "\x1B"],
    ["E", "\x1B"],
    ["f", "\f"],
    ["n", "\n"],
    ["r", "\r"],
    ["t", "	"],
    ["v", "\v"],
    ["\\", "\\"],
    ["'", "'"],
    ['"', '"']
  ]);
  if (simple.has(marker)) {
    return { value: simple.get(marker) ?? "", endIndex: slashIndex + 1 };
  }
  const numeric = marker === "x" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,2}/iu) : marker === "u" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,4}/iu) : marker === "U" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,8}/iu) : command.slice(slashIndex + 1).match(/^[0-7]{1,3}/u);
  if (numeric?.[0]) {
    const radix = marker === "x" || marker === "u" || marker === "U" ? 16 : 8;
    const codePoint = Number.parseInt(numeric[0], radix);
    if (codePoint <= 1114111) {
      const offset = marker === "x" || marker === "u" || marker === "U" ? 2 : 1;
      return {
        value: String.fromCodePoint(codePoint),
        endIndex: slashIndex + offset + numeric[0].length - 1
      };
    }
  }
  if (marker === "\n") return { value: "", endIndex: slashIndex + 1 };
  return { value: `\\${marker}`, endIndex: slashIndex + 1 };
}
var EMPTY_OPTIONS = /* @__PURE__ */ new Set();
var SIMPLE_COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["command", "exec", "nohup", "busybox", "time"]);
var SUDO_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-D",
  "-g",
  "-h",
  "-p",
  "-R",
  "-T",
  "-u",
  "--chdir",
  "--close-from",
  "--group",
  "--host",
  "--prompt",
  "--role",
  "--type",
  "--user"
]);
var ENV_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-S",
  "-u",
  "--chdir",
  "--split-string",
  "--unset"
]);
var XARGS_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-a",
  "-d",
  "-E",
  "-I",
  "-L",
  "-n",
  "-P",
  "-s",
  "--arg-file",
  "--delimiter",
  "--eof",
  "--max-args",
  "--max-chars",
  "--max-lines",
  "--max-procs",
  "--replace"
]);
var TIMEOUT_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-s",
  "--signal",
  "-k",
  "--kill-after"
]);
var NICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set(["-n", "--adjustment"]);
var STDBUF_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-i",
  "--input",
  "-o",
  "--output",
  "-e",
  "--error"
]);
var IONICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-c",
  "--class",
  "-n",
  "--classdata",
  "-p",
  "--pid"
]);
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
function skipWrapperOptions(tokens, start, optionsWithValue) {
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token?.startsWith("-")) break;
    if (token === "--") return index + 1;
    index += optionsWithValue.has(token) ? 2 : 1;
  }
  return index;
}
function tokenBasename(token) {
  return token.split("/").at(-1) ?? "";
}
function commandInvocation(tokens) {
  let index = 0;
  let stdinDriven = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_COMMAND_WRAPPERS.has(name)) {
      index = skipWrapperOptions(tokens, index + 1, EMPTY_OPTIONS);
      continue;
    }
    if (name === "sudo") {
      index = skipWrapperOptions(tokens, index + 1, SUDO_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "env") {
      index = skipWrapperOptions(tokens, index + 1, ENV_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "xargs") {
      stdinDriven = true;
      index = skipWrapperOptions(tokens, index + 1, XARGS_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "timeout") {
      index = skipWrapperOptions(tokens, index + 1, TIMEOUT_OPTIONS_WITH_VALUE);
      if (index < tokens.length && tokens[index] && !COMMAND_SEPARATORS.has(tokens[index] ?? "")) {
        index += 1;
      }
      continue;
    }
    if (name === "nice") {
      index = skipWrapperOptions(tokens, index + 1, NICE_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "stdbuf") {
      index = skipWrapperOptions(tokens, index + 1, STDBUF_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "ionice") {
      index = skipWrapperOptions(tokens, index + 1, IONICE_OPTIONS_WITH_VALUE);
      continue;
    }
    return {
      executable: name || token,
      args: tokens.slice(index + 1),
      stdinDriven
    };
  }
  return null;
}
function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let tokenStarted = false;
  let quote = null;
  let ansiCQuote = false;
  let escaped = false;
  const pushCurrent = () => {
    if (tokenStarted) {
      tokens.push(current);
      current = "";
      tokenStarted = false;
    }
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";
    const next = command[index + 1];
    if (escaped) {
      current += char;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote) {
      if (ansiCQuote && char === "\\") {
        const decoded = decodeAnsiCQuoteEscape(command, index);
        current += decoded.value;
        tokenStarted = true;
        index = decoded.endIndex;
        continue;
      }
      if (quote === '"' && char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        ansiCQuote = false;
        continue;
      }
      current += char;
      tokenStarted = true;
      continue;
    }
    if (char === "$" && (next === '"' || next === "'")) {
      quote = next;
      ansiCQuote = next === "'";
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(char)) {
      pushCurrent();
      continue;
    }
    if (char === "#" && !tokenStarted) break;
    if (char === "&" && next === "&") {
      pushCurrent();
      tokens.push("&&");
      index += 1;
      continue;
    }
    if (char === "&") {
      pushCurrent();
      tokens.push("&");
      continue;
    }
    if (char === "|" && next === "|") {
      pushCurrent();
      tokens.push("||");
      index += 1;
      continue;
    }
    if (char === ";" || char === "|") {
      pushCurrent();
      tokens.push(char);
      continue;
    }
    current += char;
    tokenStarted = true;
  }
  pushCurrent();
  return tokens;
}
function splitShellLogicalLines(command) {
  const lines = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n") {
      if (current.trim()) lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current);
  return lines;
}
function shellCommandInvocations(command) {
  const invocations = [];
  for (const logicalLine of splitShellLogicalLines(command)) {
    const tokens = tokenizeShell(logicalLine);
    let segment = [];
    for (let index = 0; index <= tokens.length; index += 1) {
      const token = tokens[index];
      if (token !== void 0 && !COMMAND_SEPARATORS.has(token)) {
        segment.push(token);
        continue;
      }
      const invocation = commandInvocation(segment);
      if (invocation) invocations.push(invocation);
      segment = [];
    }
  }
  return invocations;
}

// core/src/domain-engineering-hook.ts
var COMMAND_SEPARATORS2 = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
var SIMPLE_WRAPPERS = /* @__PURE__ */ new Set(["busybox", "command", "exec", "nohup", "time"]);
var SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var MAX_FILE_BYTES = 2 * 1024 * 1024;
function warn(plugin, message) {
  process.stderr.write(`[${plugin}] ${message}
`);
}
function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}
function tokenBasename2(token) {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}
function splitSimpleCommands(tokens) {
  const commands = [];
  let current = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS2.has(token)) {
      if (current.length) commands.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length) commands.push(current);
  return commands;
}
function unwrapCommand(tokens) {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === void 0) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename2(token);
    if (SIMPLE_WRAPPERS.has(name) || name === "nice" || name === "stdbuf") {
      index += 1;
      while (tokens[index]?.startsWith("-") && tokens[index] !== "--") index += 1;
      if (tokens[index] === "--") index += 1;
      continue;
    }
    if (name === "sudo" || name === "env") {
      index += 1;
      while (tokens[index]?.startsWith("-")) {
        const option = tokens[index];
        index += 1;
        if (name === "sudo" && option && ["-C", "-g", "-u", "--group", "--user"].includes(option)) index += 1;
      }
      continue;
    }
    if (name === "timeout") {
      index += 1;
      while (tokens[index]?.startsWith("-")) index += 1;
      if (tokens[index] && !tokens[index]?.startsWith("-")) index += 1;
      continue;
    }
    break;
  }
  return tokens.slice(index);
}
function nonFlagOperands(args) {
  const values = [];
  let skip = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (skip) {
      skip = false;
      continue;
    }
    if (arg === "--") return [...values, ...args.slice(index + 1)];
    if (arg.startsWith("-")) {
      if (["-t", "--target-directory"].includes(arg)) skip = true;
      continue;
    }
    values.push(arg);
  }
  return values;
}
function targetDirectory(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-t" || arg === "--target-directory") return args[index + 1] ?? "";
    if (arg?.startsWith("--target-directory=")) return arg.slice("--target-directory=".length);
  }
  return "";
}
function sedWriteTargets(args) {
  if (!args.some((arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[A-Za-z]*i/u.test(arg))) return [];
  const values = nonFlagOperands(args);
  return values.length > 1 ? values.slice(1) : values;
}
function commandWriteTargets(tokens) {
  const command = unwrapCommand(tokens);
  const name = tokenBasename2(command[0]);
  const args = command.slice(1);
  const operands = nonFlagOperands(args);
  const target2 = targetDirectory(args);
  if (name === "sed") return sedWriteTargets(args);
  if (name === "cp" || name === "install") return target2 ? [target2] : operands.slice(-1);
  if (name === "mv") return target2 ? [target2, ...operands] : operands;
  if (name === "rm" || name === "touch") return operands;
  if (name === "dd") return args.filter((arg) => arg.startsWith("of=")).map((arg) => arg.slice(3));
  return [];
}
function extractDomainShellWriteTargets(command) {
  const text = String(command ?? "");
  const values = [];
  const push = (raw) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) values.push(value);
  };
  for (const match of text.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  for (const tokens of splitSimpleCommands(tokenizeShell(text))) {
    for (const path of commandWriteTargets(tokens)) push(path);
  }
  return [...new Set(values)];
}
function extractDomainTargets(event) {
  const cwd = resolve3(eventCwd(event));
  let targets = [];
  if (isShellTool(eventToolName(event))) targets = extractDomainShellWriteTargets(extractShellCommand(event));
  else if (isFileMutationTool(eventToolName(event))) targets = extractFileTargets(event);
  return [...new Set(targets.map((path) => isAbsolute(path) ? resolve3(path) : resolve3(cwd, path.replace(/^\.\//u, ""))))];
}
function domainTargetsNeedPhase(policy12, targets, phase) {
  const paths = targets.map((path) => path.replaceAll("\\", "/"));
  if (phase === "pre") return paths.some((path) => policy12.protections.some((rule) => regexMatches(rule.match, path)));
  return paths.some(
    (path) => policy12.validators.some((validator) => regexMatches(validator.match, path)) || (policy12.sourceScans ?? []).some((scan) => regexMatches(scan.match, path))
  );
}
function configFileExists(cwd, plugin) {
  let cursor = resolve3(cwd);
  while (true) {
    if (existsSync(join2(cursor, `.${plugin}.mjs`))) return true;
    if (existsSync(join2(cursor, ".git"))) return false;
    const parent = dirname2(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}
function repoRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3 });
  return result.status === 0 ? result.stdout.trim() : null;
}
function relativePath(filePath, base) {
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate && candidate !== ".." && !candidate.startsWith("../") ? candidate : filePath.replaceAll("\\", "/");
}
function nearestProjectFile(root, targetPath, names) {
  let cursor = existsSync(targetPath) && statSync(targetPath).isDirectory() ? targetPath : dirname2(targetPath);
  const boundary = resolve3(root);
  while (cursor === boundary || cursor.startsWith(`${boundary}/`)) {
    for (const name of names) {
      const candidate = join2(cursor, name);
      if (existsSync(candidate)) return candidate;
    }
    if (cursor === boundary) break;
    const parent = dirname2(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}
function packageDeclaresDependency(context, dependency) {
  const packagePath = nearestProjectFile(context.root, context.targetPath, ["package.json"]);
  if (!packagePath) return false;
  try {
    const value = JSON.parse(readFileSync3(packagePath, "utf8"));
    if (!isRecord(value)) return false;
    return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((key) => isRecord(value[key]) && dependency in value[key]);
  } catch {
    return false;
  }
}
function repoContainsPath(root, pattern) {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5e3,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) return false;
  return result.stdout.split("\n").some((path) => regexMatches(pattern, path));
}
function physicalTarget(filePath) {
  let cursor = filePath;
  const suffix = [];
  while (!existsSync(cursor)) {
    const parent = dirname2(cursor);
    if (parent === cursor) return null;
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  try {
    return resolve3(realpathSync(cursor), ...suffix);
  } catch {
    return null;
  }
}
function matchPaths(filePath, base) {
  const paths = [relativePath(filePath, base)];
  const physical = physicalTarget(filePath);
  if (physical) paths.push(relativePath(physical, base));
  return [...new Set(paths)];
}
function validMode(value) {
  return value === "block" || value === "report" || value === "off";
}
function effectiveMode(enforcement, mode) {
  return enforcement === "advisory" && mode === "block" ? "report" : mode;
}
function checkEnforcement(check) {
  return check.enforcement;
}
function configuredMode(policy12, check, config) {
  const requested = config.checks[check.id] ?? check.mode;
  const mode = effectiveMode(checkEnforcement(check), requested);
  if (requested === "block" && mode === "report") {
    warn(policy12.plugin, `${check.id} is advisory; configured block mode was clamped to report`);
  }
  return mode;
}
async function loadConfig(policy12, root) {
  const defaults = { checks: {}, rules: [], maxFiles: 12, timeoutMs: 1e4, missingTools: "report-once" };
  if (!root) return defaults;
  const path = join2(root, `.${policy12.plugin}.mjs`);
  if (!existsSync(path)) return defaults;
  try {
    const loaded = await import(pathToFileURL(path).href);
    const raw = isRecord(loaded) ? loaded.default ?? loaded : loaded;
    if (!isRecord(raw)) return defaults;
    const checks2 = isRecord(raw.checks) ? Object.fromEntries(Object.entries(raw.checks).filter((entry) => validMode(entry[1]))) : {};
    const rules = Array.isArray(raw.rules) ? raw.rules.flatMap((rule, index) => {
      if (!isRecord(rule) || !(rule.match instanceof RegExp) || rule.mode !== "allow" && rule.mode !== "block") {
        warn(policy12.plugin, `rules[${index}] is invalid and was skipped`);
        return [];
      }
      const mode = rule.mode;
      return [{
        id: typeof rule.id === "string" ? rule.id : `user-rule-${index + 1}`,
        match: rule.match,
        mode,
        ...typeof rule.reason === "string" ? { reason: rule.reason } : {},
        ...typeof rule.recovery === "string" ? { recovery: rule.recovery } : {}
      }];
    }) : [];
    const limits = isRecord(raw.limits) ? raw.limits : {};
    return {
      checks: checks2,
      rules,
      maxFiles: typeof limits.maxFiles === "number" && Number.isInteger(limits.maxFiles) && limits.maxFiles >= 1 && limits.maxFiles <= 100 ? limits.maxFiles : 12,
      timeoutMs: typeof limits.timeoutMs === "number" && Number.isInteger(limits.timeoutMs) && limits.timeoutMs >= 1e3 && limits.timeoutMs <= 6e4 ? limits.timeoutMs : 1e4,
      missingTools: raw.missingTools === "silent" ? "silent" : "report-once"
    };
  } catch (error) {
    warn(policy12.plugin, `failed to load .${policy12.plugin}.mjs: ${error instanceof Error ? error.message : String(error)}`);
    return defaults;
  }
}
function protectionFor(paths, policy12, config) {
  for (const rule of config.rules) {
    if (!paths.some((path) => regexMatches(rule.match, path))) continue;
    if (rule.mode === "allow") return null;
    return {
      id: rule.id,
      match: rule.match,
      reason: rule.reason ?? "The target is covered by a project protection rule.",
      recovery: rule.recovery ?? "Change the authoritative source or add a narrower allow rule."
    };
  }
  return policy12.protections.find((rule) => paths.some((path) => regexMatches(rule.match, path))) ?? null;
}
function formatDeny(policy12, findings) {
  return [
    `[Protected File Guard] ${policy12.displayName}: Protected file modification blocked`,
    "",
    ...findings.slice(0, 10).flatMap(({ path, rule }) => [`- ${path}`, `  rule: ${rule.id}`, `  reason: ${rule.reason}`]),
    "",
    "blockingContract:",
    "  observedFacts: One or more direct write targets matched a domain-owned generated dependency path.",
    "  harm: Direct edits can diverge generated dependency state from its authoritative declarations.",
    "  unblockWhen: Use the ecosystem package manager or add a narrow project-owned allow rule.",
    "  recovery:",
    ...[...new Set(findings.map(({ rule }) => rule.recovery))].map((value) => `    - ${value}`)
  ].join("\n");
}
function executable(name, root, local = []) {
  const candidates = [...local.map((item) => join2(root, item)), ...String(process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").map((part) => join2(part, name))];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      if (process.platform !== "win32") accessSync(path, constants.X_OK);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}
function commandFor(kind, filePath) {
  if (kind === "javascript") return { command: process.execPath, args: ["--check", filePath] };
  if (kind === "typescript") return { command: "esbuild", args: [filePath, "--log-level=error", "--format=esm"], local: ["node_modules/.bin/esbuild"] };
  if (kind === "python") return { command: "python3", args: ["-c", "import pathlib,sys; p=sys.argv[1]; compile(pathlib.Path(p).read_bytes(), p, 'exec')", filePath], local: [".venv/bin/python3", "venv/bin/python3"] };
  if (kind === "ruff") return { command: "ruff", args: ["check", "--no-fix", "--output-format", "concise", filePath], local: [".venv/bin/ruff", "venv/bin/ruff"] };
  if (kind === "php") return { command: "php", args: ["-l", filePath] };
  if (kind === "composer") return { command: "composer", args: ["validate", "--no-check-publish", "--no-check-lock", filePath], local: ["vendor/bin/composer"] };
  if (kind === "eslint") return { command: "eslint", args: [filePath, "--format", "compact"], local: ["node_modules/.bin/eslint"] };
  if (kind === "swift") return { command: "swiftc", args: ["-parse", filePath] };
  if (kind === "plist") return { command: "plutil", args: ["-lint", filePath] };
  if (kind === "gofmt") return { command: "gofmt", args: ["-d", filePath] };
  if (kind === "rustfmt") return { command: "rustfmt", args: ["--check", filePath] };
  if (kind === "nix") return { command: "nix-instantiate", args: ["--parse", filePath] };
  if (kind === "kubectl") return { command: "kubectl", args: ["apply", "--dry-run=client", "--validate=false", "-f", filePath] };
  if (kind === "helm") return { command: "helm", args: ["lint", dirname2(filePath)] };
  return null;
}
async function xmlValidation(filePath) {
  const errors = [];
  try {
    new import_xmldom.DOMParser({ onError: (level, message) => {
      if (level === "fatalError" || level === "error") errors.push(message);
    } }).parseFromString(readFileSync3(filePath, "utf8"), "application/xml");
    return errors.length ? errors.join("\n") : null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
async function internalValidation(kind, filePath) {
  if (kind === "json") {
    try {
      JSON.parse(readFileSync3(filePath, "utf8"));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  if (kind === "xml") return xmlValidation(filePath);
  return void 0;
}
function sourceScanFindings(scan, relativePath3, source, mode, filePath = relativePath3) {
  if (mode === "off" || !regexMatches(scan.match, relativePath3)) return [];
  const resolvedMode = effectiveMode(checkEnforcement(scan), mode);
  return scan.inspect(filePath, source).map((hit) => ({
    check: scan.id,
    mode: resolvedMode === "off" ? "report" : resolvedMode,
    path: `${relativePath3}:${hit.line}`,
    message: `${hit.code}: ${hit.message}`
  }));
}
async function validateFile(validator, filePath, root, timeoutMs) {
  if (validator.contentMatch) {
    try {
      if (!regexMatches(validator.contentMatch, readFileSync3(filePath, "utf8"))) return null;
    } catch {
      return null;
    }
  }
  const internal = await internalValidation(validator.kind, filePath);
  if (internal !== void 0) return internal ? { check: validator.id, mode: validator.mode === "off" ? "report" : validator.mode, path: relativePath(filePath, root), message: internal } : null;
  const spec = commandFor(validator.kind, filePath);
  const unverifiableMode = checkEnforcement(validator) === "deterministic" && validator.mode === "block" ? "block" : "report";
  if (!spec?.command) return { check: validator.id, mode: unverifiableMode, path: relativePath(filePath, root), message: "No validator implementation is available." };
  const command = spec.command === process.execPath ? process.execPath : executable(spec.command, root, spec.local);
  if (!command) return { check: validator.id, mode: unverifiableMode, path: relativePath(filePath, root), message: `${spec.command} was not found; the check could not be verified.`, missingTool: spec.command };
  const result = spawnSync(command, spec.args, { cwd: root, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  if (result.error) return { check: validator.id, mode: unverifiableMode, path: relativePath(filePath, root), message: result.error.message };
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (validator.kind === "gofmt" && result.status === 0 && output) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: output };
  if ((result.status ?? 0) !== 0) return { check: validator.id, mode: validator.mode === "off" ? "report" : validator.mode, path: relativePath(filePath, root), message: output || `checker exit code ${result.status}` };
  return null;
}
function shouldReportMissingTool(policy12, root, session, finding, mode) {
  if (!finding.missingTool) return true;
  if (mode === "silent") return false;
  const identity = createHash("sha256").update(`${policy12.plugin}\0${session}\0${root}\0${finding.check}\0${finding.missingTool}`).digest("hex");
  const markerRoot = join2(tmpdir(), ".ai-experts-domain-engineering-missing");
  const marker = join2(markerRoot, identity);
  if (existsSync(marker)) return false;
  try {
    mkdirSync(markerRoot, { recursive: true });
    writeFileSync(marker, "", { flag: "wx" });
  } catch {
    if (existsSync(marker)) return false;
  }
  return true;
}
async function runPre(policy12, event) {
  const cwd = resolve3(eventCwd(event));
  const root = repoRoot(cwd) ?? cwd;
  const session = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "";
  const debts = readPolicyDebts(root, session, policy12.plugin);
  const targets = extractDomainTargets(event);
  if (debts.length && (!targets.length || targets.some((filePath) => !debts.some((debt) => debt.path === relativePath(filePath, root))))) {
    writeJson(preToolDeny(formatDomainDebtGuard(policy12.displayName, debts)));
    return;
  }
  if (!targets.length) return;
  if (!domainTargetsNeedPhase(policy12, targets, "pre") && !configFileExists(cwd, policy12.plugin)) return;
  const config = await loadConfig(policy12, repoRoot(cwd));
  const findings = targets.flatMap((filePath) => {
    const path = relativePath(filePath, root);
    if (policy12.active && !policy12.active({ root, targetPath: filePath, relativePath: path })) return [];
    const rule = protectionFor(matchPaths(filePath, root), policy12, config);
    return rule ? [{ path, rule }] : [];
  });
  if (findings.length) writeJson(preToolDeny(formatDeny(policy12, findings)));
}
async function runPost(policy12, event) {
  const cwd = resolve3(eventCwd(event));
  const rawTargets = extractDomainTargets(event);
  if (!rawTargets.length) return;
  if (!domainTargetsNeedPhase(policy12, rawTargets, "post") && !configFileExists(cwd, policy12.plugin)) return;
  const discoveredRoot = repoRoot(cwd);
  const root = discoveredRoot ?? cwd;
  const config = await loadConfig(policy12, discoveredRoot);
  const session = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "";
  const deletedPaths = new Set(rawTargets.filter((filePath) => !existsSync(filePath)).map((filePath) => relativePath(filePath, root)));
  const targets = rawTargets.filter((filePath) => {
    if (!existsSync(filePath)) return false;
    try {
      const path = relativePath(filePath, root);
      return statSync(filePath).isFile() && statSync(filePath).size <= MAX_FILE_BYTES && !SKIP_PATH.test(path) && (!policy12.active || policy12.active({ root, targetPath: filePath, relativePath: path }));
    } catch {
      return false;
    }
  }).slice(0, config.maxFiles);
  const findings = [];
  const evaluatedDebts = [];
  const failedDebts = [];
  for (const filePath of targets) {
    const path = relativePath(filePath, root);
    for (const validator of policy12.validators) {
      if (!regexMatches(validator.match, path)) continue;
      const mode = configuredMode(policy12, validator, config);
      const debt = { plugin: policy12.plugin, check: validator.id, kind: "validator", path, message: "" };
      if (checkEnforcement(validator) === "deterministic") evaluatedDebts.push(debt);
      if (mode === "off") continue;
      const finding = await validateFile({ ...validator, mode }, filePath, root, config.timeoutMs);
      if (!finding) continue;
      if (checkEnforcement(validator) === "deterministic" && mode === "block") failedDebts.push({ ...debt, message: finding.message });
      if (finding.mode === "block" || shouldReportMissingTool(policy12, root, session || "hook", finding, config.missingTools)) findings.push(finding);
    }
    const scans = policy12.sourceScans ?? [];
    if (!scans.length) continue;
    let source = "";
    try {
      source = readFileSync3(filePath, "utf8");
    } catch {
      for (const scan of scans) {
        if (!regexMatches(scan.match, path) || checkEnforcement(scan) !== "deterministic") continue;
        const debt = { plugin: policy12.plugin, check: scan.id, kind: "scan", path, message: "The source could not be read for deterministic validation." };
        evaluatedDebts.push(debt);
        if (configuredMode(policy12, scan, config) === "block") failedDebts.push(debt);
      }
      continue;
    }
    for (const scan of scans) {
      if (!regexMatches(scan.match, path)) continue;
      const mode = configuredMode(policy12, scan, config);
      const debt = { plugin: policy12.plugin, check: scan.id, kind: "scan", path, message: "" };
      if (checkEnforcement(scan) === "deterministic") evaluatedDebts.push(debt);
      const scanFindings = sourceScanFindings(scan, path, source, mode, filePath);
      if (checkEnforcement(scan) === "deterministic" && mode === "block" && scanFindings.length) {
        failedDebts.push({ ...debt, message: scanFindings.map((finding) => finding.message).join("; ") });
      }
      findings.push(...scanFindings);
    }
  }
  synchronizePolicyDebts({ root, session, plugin: policy12.plugin, evaluated: evaluatedDebts, failed: failedDebts, deletedPaths });
  if (!findings.length) return;
  const text = [
    `[${policy12.displayName}] Domain check results`,
    "",
    ...findings.flatMap((finding) => [`- [${finding.mode}] ${finding.check}: ${finding.path}`, `  ${finding.message}`])
  ].join("\n");
  if (findings.some((finding) => finding.mode === "block")) {
    process.stderr.write(`${text}
`);
    process.exitCode = 2;
  } else writeJson(additionalContext("PostToolUse", text));
}
async function runStop(policy12, event) {
  if (isStopHookActive(event)) return;
  const cwd = resolve3(eventCwd(event));
  const root = repoRoot(cwd) ?? cwd;
  const session = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "";
  const debts = readPolicyDebts(root, session, policy12.plugin);
  if (!debts.length) return;
  const config = await loadConfig(policy12, repoRoot(cwd));
  const remaining = [];
  for (const debt of debts) {
    const filePath = isAbsolute(debt.path) ? debt.path : resolve3(root, debt.path);
    if (!existsSync(filePath)) continue;
    try {
      if (!statSync(filePath).isFile()) continue;
    } catch {
      remaining.push({ ...debt, message: "The target could not be inspected." });
      continue;
    }
    const path = relativePath(filePath, root);
    if (policy12.active && !policy12.active({ root, targetPath: filePath, relativePath: path })) continue;
    if (debt.kind === "validator") {
      const validator = policy12.validators.find((candidate) => candidate.id === debt.check);
      if (!validator || checkEnforcement(validator) !== "deterministic" || configuredMode(policy12, validator, config) !== "block") continue;
      const finding = await validateFile({ ...validator, mode: "block" }, filePath, root, config.timeoutMs);
      if (finding) remaining.push({ ...debt, message: finding.message });
      continue;
    }
    const scan = policy12.sourceScans?.find((candidate) => candidate.id === debt.check);
    if (!scan || checkEnforcement(scan) !== "deterministic" || configuredMode(policy12, scan, config) !== "block") continue;
    try {
      const scanFindings = sourceScanFindings(scan, path, readFileSync3(filePath, "utf8"), "block", filePath);
      if (scanFindings.length) remaining.push({ ...debt, message: scanFindings.map((finding) => finding.message).join("; ") });
    } catch {
      remaining.push({ ...debt, message: "The source could not be read for deterministic validation." });
    }
  }
  synchronizePolicyDebts({ root, session, plugin: policy12.plugin, evaluated: debts, failed: remaining });
  if (!remaining.length) return;
  writeJson(stopBlock(formatDomainDebtGuard(policy12.displayName, remaining)));
}
async function runDomainEngineeringHook(policy12, phase) {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (phase === "pre") await runPre(policy12, event);
  else if (phase === "post") await runPost(policy12, event);
  else if (phase === "stop") await runStop(policy12, event);
  else warn(policy12.plugin, `unknown hook phase ${String(phase)}`);
}

// plugins/workspace-integrity/src/domains/android/lib/compose-detect.ts
var COLLECT_AS_STATE = /\bcollectAsState\s*\(/u;
var PAGING_NEAR = /\b(?:PagingData|LazyPagingItems|collectAsLazyPagingItems)\b/u;
var BOXED_PRIMITIVE_TYPE = /\bmutableStateOf\s*<\s*(?:Int|Long|Float|Double)\s*>/u;
var BOXED_PRIMITIVE_LITERAL = /\bmutableStateOf\s*\(\s*-?(?:0x[0-9A-Fa-f]+|\d+(?:\.\d+)?[fFlL]?)\s*\)/u;
var FOREGROUND_NAMED = /(?:color|tint)\s*=\s*Color\.(?:Black|White)\b/u;
var FOREGROUND_ARGB = /(?:color|tint)\s*=\s*Color\s*\(\s*0x[0-9A-Fa-f]+/u;
var COLOR_SCHEME = /\b(?:MaterialTheme\.)?colorScheme\b/u;
function maskRange(text) {
  return text.replace(/[^\n]/gu, " ");
}
function maskKotlin(source) {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (current === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (source.startsWith('"""', index)) {
      const end = source.indexOf('"""', index + 3);
      const stop = end === -1 ? source.length : end + 3;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (current === '"' || current === "'") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === current) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      out += maskRange(source.slice(index, cursor));
      index = cursor;
      continue;
    }
    out += current ?? "";
    index += 1;
  }
  return out;
}
function nearbyPaging(lines, index) {
  const from = Math.max(0, index - 2);
  const to = Math.min(lines.length, index + 3);
  return lines.slice(from, to).some((line) => PAGING_NEAR.test(line));
}
function pushUnique(findings, finding) {
  if (findings.some((item) => item.code === finding.code && item.line === finding.line)) return;
  findings.push(finding);
}
function detectComposeSource(source) {
  if (typeof source !== "string" || source.length === 0) return [];
  const visible = maskKotlin(source);
  const lines = visible.split(/\n/u);
  const findings = [];
  const hasColorScheme = COLOR_SCHEME.test(visible);
  for (const [index, line] of lines.entries()) {
    if (COLLECT_AS_STATE.test(line)) {
      const paging = nearbyPaging(lines, index);
      pushUnique(findings, paging ? {
        code: "PAGING_COLLECT_AS_STATE",
        line: index + 1,
        message: "PagingData must be collected with collectAsLazyPagingItems(), not collectAsState()."
      } : {
        code: "COLLECT_AS_STATE",
        line: index + 1,
        message: "UI Flow collection should use collectAsStateWithLifecycle(); if this is PagingData, use collectAsLazyPagingItems() instead."
      });
    }
    if (BOXED_PRIMITIVE_TYPE.test(line) || BOXED_PRIMITIVE_LITERAL.test(line)) {
      pushUnique(findings, {
        code: "PRIMITIVE_MUTABLE_STATE",
        line: index + 1,
        message: "Use mutableIntStateOf, mutableLongStateOf, mutableFloatStateOf, or mutableDoubleStateOf instead of boxed mutableStateOf."
      });
    }
    if (hasColorScheme && (FOREGROUND_NAMED.test(line) || FOREGROUND_ARGB.test(line))) {
      pushUnique(findings, {
        code: "HARDCODED_ON_THEME",
        line: index + 1,
        message: "Foreground Color.Black, Color.White, or Color(0x\u2026) over colorScheme is a dark-mode regression; use the matching on* role."
      });
    }
  }
  return findings;
}

// plugins/workspace-integrity/src/domains/android/policy.ts
var KOTLIN_SOURCE = /\.(?:kt|kts)$/iu;
function composeHits(codes) {
  return (_filePath, source) => detectComposeSource(source).filter((hit) => codes.has(hit.code)).map((hit) => ({ line: hit.line, code: hit.code, message: hit.message }));
}
function r8Hits(pattern, code, message) {
  return (_filePath, source) => source.split(/\r?\n/u).flatMap((line, index) => {
    const rule = line.trim();
    if (!rule || rule.startsWith("#") || !pattern.test(rule)) return [];
    return [{ line: index + 1, code, message }];
  });
}
var policy = {
  plugin: "android-engineering",
  displayName: "Android Engineering",
  active: (context) => /(?:AndroidManifest\.xml|res\/.+\.xml)$/iu.test(context.relativePath) || repoContainsPath(context.root, /(?:^|\/)AndroidManifest\.xml$/iu),
  protections: [
    { id: "android-gradle-locks", match: /(?:^|\/)gradle\.lockfile$|(?:^|\/)gradle\/dependency-locks\/[^/]+\.lockfile$/iu, reason: "Android dependency locks are generated by Gradle.", recovery: "Change Gradle dependency declarations and regenerate locks through the project wrapper." },
    { id: "android-gradle-cache", match: /(?:^|\/)\.gradle(?:\/|$)/iu, reason: "The Android Gradle cache is tool-owned.", recovery: "Change sources or declarations and let Gradle recreate the cache." }
  ],
  validators: [
    { id: "androidXml", enforcement: "deterministic", kind: "xml", match: /(?:AndroidManifest\.xml|res\/.+\.xml)$/iu, mode: "block" },
    { id: "androidJson", enforcement: "deterministic", kind: "json", match: /(?:^|\/)google-services\.json$/iu, mode: "block" }
  ],
  sourceScans: [
    { id: "composeCollectAsState", enforcement: "advisory", match: KOTLIN_SOURCE, mode: "report", inspect: composeHits(/* @__PURE__ */ new Set(["COLLECT_AS_STATE", "PAGING_COLLECT_AS_STATE"])) },
    { id: "composePrimitiveState", enforcement: "advisory", match: KOTLIN_SOURCE, mode: "report", inspect: composeHits(/* @__PURE__ */ new Set(["PRIMITIVE_MUTABLE_STATE"])) },
    { id: "composeLiteralColor", enforcement: "advisory", match: KOTLIN_SOURCE, mode: "report", inspect: composeHits(/* @__PURE__ */ new Set(["HARDCODED_ON_THEME"])) },
    { id: "r8BroadKeep", enforcement: "advisory", match: /(?:^|\/)(?:proguard[^/]*|[^/]+\.pro)$/iu, mode: "report", inspect: r8Hits(/^-keep(?:,[^\s]+)?\s+(?:class|enum|interface)\s+\*\*(?:\s+\{\s*\*\s*;\s*\})?\s*$/iu, "R8_BROAD_KEEP", "Broad keep rules can disable shrinking across the application; scope the rule to the reflected API surface.") },
    { id: "r8GlobalDontWarn", enforcement: "advisory", match: /(?:^|\/)(?:proguard[^/]*|[^/]+\.pro)$/iu, mode: "report", inspect: r8Hits(/^-dontwarn\s+\*\*\s*$/iu, "R8_GLOBAL_DONTWARN", "Global warning suppression hides missing-class evidence; scope it to a verified optional dependency.") }
  ]
};

// plugins/workspace-integrity/src/domains/commands/entries/hooks/cmd-safety-hook-post-tool.ts
import { existsSync as existsSync3 } from "node:fs";
import { isAbsolute as isAbsolute2, resolve as resolve4 } from "node:path";

// plugins/workspace-integrity/src/domains/commands/lib/hook-io.ts
function extractShellCommand2(toolName, toolInput) {
  return extractShellCommand({ tool_name: toolName, tool_input: toolInput });
}
function extractWriteTargets(toolNameOrEvent, toolInput) {
  const event = toolInput === void 0 ? toolNameOrEvent : { tool_name: toolNameOrEvent, tool_input: toolInput, cwd: process.cwd() };
  return extractFileTargets(event, { tools: "any", includeShellWrites: true });
}
function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT)
  });
}

// plugins/workspace-integrity/src/domains/commands/engines/file-safety.ts
import { readFileSync as readFileSync4 } from "node:fs";
import { basename as basename2, extname } from "node:path";
var TLS = [/\bInsecureSkipVerify\s*:\s*true\b/u, /\brejectUnauthorized\s*:\s*false\b/u, /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/u, /\bverify\s*=\s*False\b/u, /\bssl\.CERT_NONE\b/u, /\b_create_unverified_context\s*\(/u, /CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*(?:=>|,)\s*(?:false|0|0L)\b/iu, /\bdanger_accept_invalid_certs\s*\(\s*true\s*\)/u, /\bOpenSSL::SSL::VERIFY_NONE\b/u];
var LOG = /(?:logger|log|logging|slog|zap|zerolog|logrus|fmt)\s*\.\s*\w+\s*\(|console\s*\.\s*(?:log|info|warn|error|debug)\s*\(|fmt\.(?:Print|Println|Printf|Fprintf|Sprintf)\s*\(|print(?:f|ln)?\s*\(/iu;
var PII = /(?<!['"` ])\b(?:email|phone|mobile|tel(?:ephone)?|password|passwd|secret|token|api[_-]?key|ssn|national[_-]?id|credit[_-]?card|cvv|birth(?:day|date)|身份证|手机号|邮箱|密码|证件号)\b(?!['"`])/iu;
var SOURCE = /* @__PURE__ */ new Set([".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".py", ".java", ".kt", ".scala", ".go", ".rs", ".php", ".rb", ".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".cs"]);
function read(path) {
  try {
    const bytes = readFileSync4(path);
    return bytes.length <= 2 * 1024 * 1024 ? { text: bytes.toString("utf8") } : null;
  } catch {
    return null;
  }
}
function count(text, predicate) {
  return text.split("\n").filter(predicate).length;
}
function testPath(path) {
  const normalized = path.replaceAll("\\", "/");
  return /\/(?:tests?|spec|__tests__|__mocks__|fixtures?|testdata|e2e)\//u.test(normalized) || /\.(?:test|spec|e2e)\.[^.]+$/u.test(basename2(path));
}
function fileSafetyReports(path, input = {}) {
  const content = read(path);
  if (!content) return [];
  const extension = extname(path).toLowerCase(), reports = [];
  if (!SOURCE.has(extension) || testPath(path)) return reports;
  const newText = typeof input.new_string === "string" ? input.new_string : content.text, oldText = typeof input.old_string === "string" ? input.old_string : "";
  const tlsLine = (line) => !/^\s*(?:\/\/|#|\/\*|\*)/u.test(line) && !/(?:原因).*?(?:expires|ticket|issue|#\d|过期|到期)/iu.test(line) && TLS.some((pattern) => pattern.test(line));
  const tls = count(newText, tlsLine) - count(oldText, tlsLine);
  if (tls > 0) reports.push(`[Insecure TLS Notice] ${path}: ${tls} net-new TLS verification bypass(es); use a trusted CA or a ticketed, expiring exception`);
  const normalized = path.toLowerCase().replaceAll("\\", "/");
  if (!/\/(?:sanitiz|redact|mask|anonymiz|obfuscat)/u.test(normalized)) {
    const piiLine = (line) => LOG.test(line) && PII.test(line);
    const pii = count(newText, piiLine) - count(oldText, piiLine);
    if (pii > 0) reports.push(`[Log PII Notice] ${path}: ${pii} net-new log call(s) contain direct PII variables; redact or log a non-sensitive identifier`);
  }
  return reports;
}

// plugins/workspace-integrity/src/domains/commands/lib/rule-engine.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import { join as join3 } from "node:path";
import { pathToFileURL as pathToFileURL2 } from "node:url";

// plugins/workspace-integrity/src/domains/commands/lib/builtin-rules.ts
import { createHash as createHash2 } from "node:crypto";
function fileAwareEditRecovery(host2) {
  if (host2 === "codex") {
    return "Use apply_patch for new or existing files so path guards and verification hooks can observe the change.";
  }
  if (host2 === "claude") {
    return "Use Write for new files or Edit for existing files so path guards and verification hooks can observe the change.";
  }
  return "Use the host's file-aware editing tool so path guards and verification hooks can observe the change.";
}
var SQL_CLIENTS = /* @__PURE__ */ new Set([
  "mysql",
  "mariadb",
  "mysqlsh",
  "mycli",
  "psql",
  "pgcli",
  "cockroach",
  "sqlite3",
  "litecli",
  "duckdb",
  "clickhouse",
  "clickhouse-client",
  "sqlcmd",
  "usql",
  "snowsql",
  "trino",
  "presto",
  "mongosh",
  "mongo"
]);
function programInvocations(command, programs) {
  return shellCommandInvocations(command).filter(
    (invocation) => programs.has(invocation.executable.toLowerCase())
  );
}
function digest(command) {
  return createHash2("sha256").update(command).digest("hex").slice(0, 16);
}
function cleanedSql(command) {
  return tokenizeShell(command).join(" ").replace(/--(?=\s|$)[^\n]*/gu, "").replace(/\/\*[\s\S]*?\*\//gu, "");
}
function isTempPathOperand(token) {
  const value = String(token ?? "");
  return /^(?:\/tmp\/|\/private\/tmp\/|\$\{?TMPDIR\}?\/)/u.test(value);
}
function sedFileOperands(args) {
  const files = [];
  let sawExpression = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--") {
      files.push(...args.slice(index + 1));
      break;
    }
    if (argument === "-e" || argument === "--expression" || argument === "-f" || argument === "--file") {
      sawExpression = true;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) continue;
    if (!sawExpression) {
      sawExpression = true;
      continue;
    }
    files.push(argument);
  }
  return files;
}
function sedHasUnbackedInplace(args) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--in-place") return true;
    if (argument.startsWith("--in-place=")) continue;
    const short = argument.match(/^-[A-Za-z]*i(.*)$/u);
    if (!short) continue;
    if (short[1]) continue;
    if (args[index + 1] === "") continue;
    return true;
  }
  return false;
}
function sedInplaceReason(command) {
  const invocations = programInvocations(command, /* @__PURE__ */ new Set(["sed"]));
  for (const { args } of invocations) {
    if (!sedHasUnbackedInplace(args)) continue;
    const files = sedFileOperands(args);
    if (files.length > 0 && files.every((file) => isTempPathOperand(file))) {
      continue;
    }
    return "sed -i modifies files in place without a backup and cannot be rolled back";
  }
  return null;
}
var CAT_HEREDOC_WRITE_RE = /\bcat\s*(?:>|>>)\s*\S+[^|]*<<|cat\s*<<-?\s*['"]?\w+['"]?\s*(?:>|>>)\s*\S+/;
function isCatHeredocWrite(command) {
  return CAT_HEREDOC_WRITE_RE.test(command);
}
function isCatPipeInput(command) {
  return /<<-?\s*['"]?\w+['"]?\s*\|/.test(command);
}
function isCatTmpRedirect(command) {
  return /(?:>|>>)\s*(?:\/tmp\/\S+|\/private\/tmp\/\S+|\$TMPDIR\/\S+)/.test(
    command
  );
}
function redisOperation(command) {
  const invocations = programInvocations(command, /* @__PURE__ */ new Set(["redis-cli"]));
  for (const { args } of invocations) {
    const match = args.join(" ").match(
      /\b(?:KEYS|MONITOR|FLUSHALL|FLUSHDB|DEL|RANDOMKEY|SETBIT|BGSAVE|BGREWRITEAOF)\b/iu
    );
    const operation = match?.[0];
    if (operation) return operation.toUpperCase();
  }
  return null;
}
function sqlDestructiveReason(command) {
  const blocks = [
    [/\bDROP\s+(?:DATABASE|TABLE|SCHEMA|INDEX|VIEW)\b/iu, "DROP permanently deletes a database object"],
    [/\bTRUNCATE\s+(?:TABLE\s+)?\w/iu, "TRUNCATE removes all table data"],
    [/\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/iu, "DROP COLUMN permanently deletes column data"],
    [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/iu, "DELETE is missing WHERE"],
    [/\bUPDATE\s+[^;]+\s+SET\b(?![^;]*\bWHERE\b)/iu, "UPDATE is missing WHERE"]
  ];
  for (const { args } of programInvocations(command, SQL_CLIENTS)) {
    const cleaned = cleanedSql(args.join(" "));
    for (const [pattern, reason] of blocks) {
      if (pattern.test(cleaned)) return reason;
    }
  }
  return null;
}
function sqlPrivilegeHit(command) {
  return programInvocations(command, SQL_CLIENTS).some(
    ({ args }) => /\b(?:GRANT|REVOKE)\b/iu.test(cleanedSql(args.join(" ")))
  );
}
function activeTestReason(command) {
  for (const { executable: executable2, args } of shellCommandInvocations(command)) {
    const program = executable2.toLowerCase();
    const subject = args.join(" ");
    if (["masscan", "zmap"].includes(program)) {
      return "the high-speed internet-wide scanner has no auditable boundary";
    }
    if (["hping", "hping3"].includes(program) && /--flood\b/u.test(subject)) {
      return "flood mode is prohibited";
    }
    if (program === "nmap") {
      const cidr = subject.match(/\S+\/(\d{1,2})\b/u);
      const cidrBits = cidr?.[1];
      if (cidrBits !== void 0 && Number(cidrBits) <= 20) {
        return `target range /${cidrBits} exceeds the /21 limit`;
      }
      if (/(?:^|\s)-p-(?:\s|$)/u.test(subject) && !/--max-rate(?:=|\s+)\d+/u.test(subject)) {
        return "the all-port scan is missing --max-rate";
      }
    }
    if (["ffuf", "gobuster", "feroxbuster"].includes(program) && !/(?:^|\s)(?:-rate|--rate|-t|--threads)(?:=|\s+)\d+/u.test(subject)) {
      return "content enumeration is missing a rate or thread limit";
    }
  }
  return null;
}
function secretLeakHit(command) {
  return shellCommandInvocations(command).some(secretLeakInvocationHit);
}
function runtimeLogInvocationHit({ executable: executable2, args }) {
  const program = executable2.toLowerCase();
  const action = args[0]?.toLowerCase();
  return program === "adb" && action === "logcat" || program === "docker" && action === "logs" || program === "kubectl" && action === "logs" || program === "journalctl";
}
function runtimeLogSanitizerInvocationHit({ executable: executable2, args }) {
  if (executable2.toLowerCase() !== "node") return false;
  const harnessIndex = args.findIndex((arg) => /(?:^|[\\/])dist[\\/]cli[\\/]harness\.mjs$/u.test(arg));
  return harnessIndex >= 0 && args[harnessIndex + 1] === "logs" && args[harnessIndex + 2] === "sanitize";
}
function unsafeRuntimeLogHit(command) {
  const separators = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
  const tokens = tokenizeShell(command);
  const segments = [];
  let current = [];
  for (let index = 0; index <= tokens.length; index += 1) {
    const token = tokens[index];
    if (token !== void 0 && !separators.has(token)) {
      current.push(token);
      continue;
    }
    segments.push({ invocation: commandInvocation(current), separator: token ?? null });
    current = [];
  }
  for (const [index, segment] of segments.entries()) {
    if (!segment.invocation || !runtimeLogInvocationHit(segment.invocation)) continue;
    const next = segments[index + 1]?.invocation;
    if (segment.separator !== "|" || !next || !runtimeLogSanitizerInvocationHit(next)) return true;
  }
  return false;
}
function secretLeakInvocationHit({ executable: executable2, args }) {
  const program = executable2.toLowerCase();
  const subject = args.join(" ");
  if (["cat", "head", "tail", "less", "more", "bat"].includes(program)) {
    return /(?:\.pem|\.key|\.p12|\.pfx|id_rsa|id_ed25519|\.jks|\.keystore|\.env\b|credentials\.json|\.aws\/credentials|\.netrc|\.git-credentials)/iu.test(
      subject
    );
  }
  if (["curl", "wget", "http"].includes(program)) {
    return /(?:--data(?:-raw|-binary)?|--form|-d|-F)\s[^;|&]*(?:\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|API_SECRET|AWS_SECRET_ACCESS_KEY|DATABASE_PASSWORD|DB_PASSWORD)|\$\(\s*cat\s+[^)]*(?:\.pem|\.key|id_rsa|id_ed25519))/iu.test(
      subject
    );
  }
  if (program === "apksigner") {
    return /(?:--ks-pass|--key-pass)(?:=|\s+)pass:/iu.test(subject);
  }
  if (program === "base64") {
    return /(?:\.pem|\.key|id_rsa|id_ed25519|PRIVATE)/iu.test(subject);
  }
  if (program === "echo") {
    return /\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|TOKEN|API_KEY)/iu.test(subject);
  }
  return false;
}
var BUILTIN_RULES = [
  {
    id: "sed-inplace",
    title: "sed -i Guard",
    mode: "deny",
    match: { test: (command) => Boolean(sedInplaceReason(command)) },
    resolveReason: (command) => sedInplaceReason(command) ?? "sed in-place editing has no recoverable backup",
    recovery: "Use Edit/apply_patch for replacements; if sed is required, create an explicit recoverable backup first. Unbacked sed -i under /tmp, /private/tmp, or $TMPDIR/ is allowed.",
    observedFacts: "The Bash input contains sed --in-place or bare sed -i without a backup suffix on a non-temporary path.",
    harm: "In-place rewrites are difficult to review or recover and bypass file-aware editing hooks.",
    unblockWhen: "Target only temporary paths (/tmp/\u2026, $TMPDIR/\u2026), use a backup suffix, or use a file-aware editing tool."
  },
  {
    id: "cat-heredoc-repo-write",
    title: "Cat Write Guard",
    mode: "deny",
    match: {
      test: (command) => isCatHeredocWrite(command) && !isCatPipeInput(command) && !isCatTmpRedirect(command)
    },
    reason: "Writing a file through a Bash cat heredoc bypasses all PostToolUse hooks",
    recovery: "Use the host's file-aware editing tool.",
    observedFacts: "The Bash input contains a cat heredoc redirected to a non-temporary file.",
    harm: "The write bypasses file-aware target checks, change hooks, and post-write verification.",
    unblockWhen: "The heredoc is used only as pipeline input, writes only to an allowed temporary directory, or is replaced with a file-aware editing tool.",
    formatMessage: (command, host2) => [
      "[Cat Write Guard] cat heredoc file write blocked",
      "",
      "Writing a file through a Bash cat heredoc bypasses all PostToolUse hooks:",
      "  \u2022 syntax checkers do not run",
      "  \u2022 line-budget checks are outside this command-safety responsibility",
      "  \u2022 encoding guards do not check encoding",
      "  \u2022 path guards do not check the write target",
      "",
      `Command: ${command}`,
      "",
      `Alternative: ${fileAwareEditRecovery(host2)}`,
      "",
      "blockingContract:",
      "  observedFacts: The Bash input contains a cat heredoc redirected to a non-temporary file.",
      "  harm: The write bypasses file-aware target checks, change hooks, and post-write verification.",
      "  unblockWhen: The heredoc is used only as pipeline input, writes only to an allowed temporary directory, or is replaced with a file-aware editing tool.",
      `  recovery: ${fileAwareEditRecovery(host2)}`
    ].join("\n")
  },
  {
    id: "cat-heredoc-tmp-write",
    title: "Cat Write Guard",
    mode: "report",
    match: {
      test: (command) => isCatHeredocWrite(command) && !isCatPipeInput(command) && isCatTmpRedirect(command)
    },
    reason: "Writing a temporary file with a Bash cat heredoc does not trigger file-aware PostToolUse checks",
    recovery: "Temporary scripts may proceed, but prefer the host's file-aware editing tool.",
    formatMessage: (command, host2) => [
      "[Cat Write Guard] cat heredoc temporary-file write detected",
      "",
      "Writing a file with a Bash cat heredoc does not trigger file-aware PostToolUse checks.",
      `Temporary scripts may proceed. ${fileAwareEditRecovery(host2)}`,
      `Command: ${command}`
    ].join("\n")
  },
  {
    id: "redis-cli-risk",
    title: "Redis CLI Risk",
    mode: "deny",
    match: {
      test: (command) => {
        const op = redisOperation(command);
        return Boolean(
          op && ["KEYS", "MONITOR", "FLUSHALL", "FLUSHDB"].includes(op)
        );
      }
    },
    resolveReason: (command) => {
      const op = redisOperation(command);
      return `${op} scans, blocks, or clears Redis data`;
    },
    recovery: "Confirm the target instance, data scope, and recoverable alternative first",
    observedFacts: "The command matches a high-risk Redis CLI operation.",
    harm: "It may cause data loss or block the instance.",
    unblockWhen: "Use an auditable narrow-scope operation or declare a precise allow rule in configuration."
  },
  {
    id: "redis-cli-pressure",
    title: "Redis CLI Risk",
    mode: "report",
    match: {
      test: (command) => {
        const op = redisOperation(command);
        return Boolean(
          op && ["DEL", "RANDOMKEY", "SETBIT", "BGSAVE", "BGREWRITEAOF"].includes(
            op
          )
        );
      }
    },
    resolveReason: (command) => {
      const op = redisOperation(command);
      return `${op} may block the main thread or increase instance resource pressure`;
    },
    recovery: "Confirm the target instance, data scope, and recoverable alternative first"
  },
  {
    id: "sql-destructive",
    title: "Dangerous SQL",
    mode: "deny",
    match: { test: (command) => Boolean(sqlDestructiveReason(command)) },
    resolveReason: (command) => sqlDestructiveReason(command) ?? "dangerous SQL",
    recovery: "Add an explicit WHERE clause or complete backup, authorization, and recovery verification first",
    observedFacts: "The SQL client command matches a destructive change or a mutation without WHERE.",
    harm: "It may permanently delete database objects or remove data in bulk.",
    unblockWhen: "Add WHERE, backup, and authorization before executing."
  },
  {
    id: "sql-privilege",
    title: "SQL Notice",
    mode: "report",
    match: { test: (command) => sqlPrivilegeHit(command) },
    reason: "database privileges will change",
    recovery: "Confirm the target user, least-privilege scope, and rollback statement"
  },
  {
    id: "active-test-unbounded",
    title: "Security Active Test Scope Guard",
    mode: "deny",
    match: { test: (command) => Boolean(activeTestReason(command)) },
    resolveReason: (command) => activeTestReason(command) ?? "active security testing lacks an auditable boundary",
    recovery: "Use an explicit target and bounded rate",
    observedFacts: "The active security testing command lacks an auditable boundary.",
    harm: "It may scan outside the authorized scope or overload resources.",
    unblockWhen: "Declare the target scope and rate or thread limit."
  },
  {
    id: "runtime-log-raw-output",
    title: "Runtime Log Output Guard",
    mode: "deny",
    match: { test: (command) => unsafeRuntimeLogHit(command) },
    reason: "raw runtime logs can contain credentials, authorization headers, and user data",
    recovery: 'Pipe the bounded log command directly through `node "$PLUGIN_ROOT/dist/cli/harness.mjs" logs sanitize` before any output, file write, or additional pipeline stage.',
    observedFacts: "The command reads adb, Docker, Kubernetes, or journal logs without the bundled sanitizer as its direct output boundary.",
    harm: "Raw tool output is persisted in the host session and may expose credentials or personal data.",
    unblockWhen: "Every runtime-log producer is piped directly through the bundled logs sanitize command.",
    sensitive: true
  },
  {
    id: "secret-leak",
    title: "Secret Leak Notice",
    mode: "report",
    match: { test: (command) => secretLeakHit(command) },
    resolveReason: (command) => `The command may read, print, or transmit sensitive credentials (digest ${digest(command)})`,
    recovery: "Read only required fields, never echo or exfiltrate them, and use environment references and secure credential channels",
    sensitive: true
  },
  {
    id: "lark-yes",
    title: "Lark CLI Confirmation Audit",
    mode: "report",
    match: {
      test: (command) => programInvocations(command, /* @__PURE__ */ new Set(["lark-cli"])).some(
        ({ args }) => args.includes("--yes")
      )
    },
    reason: "non-interactive --yes confirmation detected",
    recovery: "Confirm the target resource, write/delete scope, recoverable copy, and read-back verification",
    sensitive: true
  }
];

// plugins/workspace-integrity/src/domains/commands/lib/sanitize-command.ts
function sanitizeCommand(command) {
  if (typeof command !== "string" || !command) return "";
  let stripped = command.replace(
    /\$\(cat\s+<<'?(\w+)'?\n[\s\S]*?\n\1\s*\)/g,
    " __HEREDOC__ "
  );
  stripped = stripped.replace(
    /\bgit\s+commit\b[^;|&]*/g,
    (commitCommand) => commitCommand.replace(/-m\s+"(?:[^"\\]|\\.)*"/g, '-m "__MSG__"').replace(/-m\s+'[^']*'/g, "-m '__MSG__'")
  );
  return stripped;
}

// plugins/workspace-integrity/src/domains/commands/lib/rule-engine.ts
var CONFIG_FILE_NAMES = [
  ".command-safety.mjs",
  ".command-safety.cjs",
  ".command-safety.js"
];
var DEFAULT_SETTINGS = {
  engines: {
    dangerousRm: true,
    verificationIntegrity: true,
    mysqlReplicationPreflight: true,
    secretRead: true,
    fileSafety: true,
    denyEscalation: true
  },
  escalation: {
    windowMinutes: 10,
    threshold: 3
  }
};
function isMatcher(value) {
  return value instanceof RegExp || isRecord(value) && typeof value.test === "function";
}
function testMatcher(matcher, subject) {
  if (matcher instanceof RegExp) {
    return new RegExp(matcher.source, matcher.flags).test(subject);
  }
  return matcher.test(subject);
}
function isRuleMode(value) {
  return value === "deny" || value === "report" || value === "allow";
}
function optionalString(value) {
  return typeof value === "string" ? value : void 0;
}
function resolveEngineSettings(raw) {
  const engines = { ...DEFAULT_SETTINGS.engines };
  if (!isRecord(raw)) return engines;
  if (typeof raw.verificationIntegrity === "boolean") {
    engines.verificationIntegrity = raw.verificationIntegrity;
  }
  if (typeof raw.mysqlReplicationPreflight === "boolean") {
    engines.mysqlReplicationPreflight = raw.mysqlReplicationPreflight;
  }
  if (typeof raw.secretRead === "boolean") engines.secretRead = raw.secretRead;
  if (typeof raw.fileSafety === "boolean") engines.fileSafety = raw.fileSafety;
  return engines;
}
function resolveEscalationSettings(_raw) {
  return { ...DEFAULT_SETTINGS.escalation };
}
function validateRule(rule, i) {
  if (!rule || typeof rule !== "object") {
    process.stderr.write(
      `[command-safety] rule[${i}]: must be an object, skipping
`
    );
    return false;
  }
  if (!("match" in rule) || !(rule.match instanceof RegExp)) {
    process.stderr.write(
      `[command-safety] rule[${i}]: "match" must be a RegExp, skipping
`
    );
    return false;
  }
  const mode = "mode" in rule ? rule.mode ?? "deny" : "deny";
  if (!isRuleMode(mode)) {
    process.stderr.write(
      `[command-safety] rule[${i}]: "mode" must be deny|report|allow, skipping
`
    );
    return false;
  }
  return true;
}
function resolveRules(userConfig) {
  const config = isRecord(userConfig) ? userConfig : {};
  const rawUser = Array.isArray(config.rules) ? config.rules : [];
  if (config.rules !== void 0 && !Array.isArray(config.rules)) {
    process.stderr.write(
      `[command-safety] config "rules" must be an array, using built-ins
`
    );
  }
  const userRules = rawUser.map((rule, i) => ({ rule, i })).filter((item) => validateRule(item.rule, item.i)).map(({ rule, i }) => {
    const mode = isRuleMode(rule.mode) ? rule.mode : "deny";
    return {
      id: typeof rule.id === "string" && rule.id ? rule.id : `user-rule[${i}]`,
      match: rule.match,
      mode,
      title: optionalString(rule.title),
      reason: optionalString(rule.reason),
      recovery: optionalString(rule.recovery),
      observedFacts: optionalString(rule.observedFacts),
      harm: optionalString(rule.harm),
      unblockWhen: optionalString(rule.unblockWhen),
      sensitive: Boolean(rule.sensitive)
    };
  });
  const settingsSource = isRecord(config.settings) ? config.settings : null;
  return {
    rules: [...userRules, ...BUILTIN_RULES],
    settings: {
      engines: resolveEngineSettings(settingsSource?.engines),
      escalation: resolveEscalationSettings(settingsSource?.escalation)
    }
  };
}
function matchRule(command, rules, options = {}) {
  const { sanitize = true } = options;
  if (typeof command !== "string" || !command) return null;
  const subject = sanitize ? sanitizeCommand(command) : command;
  for (const rule of rules) {
    if (!isMatcher(rule.match)) continue;
    try {
      if (testMatcher(rule.match, subject)) return rule;
    } catch {
      continue;
    }
  }
  return null;
}
function resolveReason(rule, command) {
  if (typeof rule.resolveReason === "function") {
    return rule.resolveReason(command);
  }
  return rule.reason || `matched rule ${rule.id}`;
}
function formatFinding(rule, command, options = {}) {
  if (typeof rule.formatMessage === "function") {
    return rule.formatMessage(command, options.host);
  }
  const title = rule.title || rule.id || "Command Safety";
  const reason = resolveReason(rule, command);
  const recovery = rule.recovery || "Adjust the command and retry, or declare an allow rule in the project configuration.";
  if (rule.mode === "report") {
    return [
      `[${title}] Risk notice`,
      "",
      `Reason: ${reason}`,
      `Recovery/alternative: ${recovery}`,
      `Command: ${command}`
    ].join("\n");
  }
  return [
    `[${title}] Blocked`,
    "",
    `Reason: ${reason}`,
    `Recovery/alternative: ${recovery}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    `  observedFacts: ${rule.observedFacts || "The command matched a declarative command-safety rule."}`,
    `  harm: ${rule.harm || "It may cause data loss, out-of-scope testing, credential exposure, or unrecoverable changes."}`,
    `  unblockWhen: ${rule.unblockWhen || "Provide authorization, scope, backup, or a safe alternative, or add a precise allow rule."}`,
    `  recovery: ${recovery}`
  ].join("\n");
}
function resolveRepoRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3,
      cwd
    }).trim();
  } catch {
    return null;
  }
}
async function loadUserConfig(repoRoot2) {
  if (!repoRoot2) return null;
  for (const name of CONFIG_FILE_NAMES) {
    const path = join3(repoRoot2, name);
    if (!existsSync2(path)) continue;
    try {
      const loaded = await import(pathToFileURL2(path).href);
      if (!isRecord(loaded)) return loaded;
      return loaded.default ?? loaded;
    } catch (error) {
      const message = isRecord(error) && error.message != null ? String(error.message) : String(error);
      process.stderr.write(
        `[command-safety] Failed to load ${name}: ${message}
`
      );
      return null;
    }
  }
  return null;
}

// plugins/workspace-integrity/src/domains/commands/entries/hooks/cmd-safety-hook-post-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = eventCwd(event);
  const repoRoot2 = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot2);
  const { settings } = resolveRules(userConfig);
  if (settings.engines.fileSafety === false) return;
  const input = eventToolInput(event);
  const reports = extractWriteTargets(event).map((path) => isAbsolute2(path) ? path : resolve4(cwd, path)).filter(existsSync3).flatMap((path) => fileSafetyReports(path, input));
  if (reports.length) {
    writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  }
}

// plugins/workspace-integrity/src/domains/commands/lib/matchers.ts
var SHELL_TOOLS = /^(Bash|Shell|bash|shell|shell_command|exec_command|exec|local_shell)$/i;
function normalizeToolName(toolName) {
  if (typeof toolName !== "string" || !toolName) return "";
  const lower = toolName.trim().toLowerCase();
  const map = {
    apply_patch: "ApplyPatch",
    applypatch: "ApplyPatch",
    write: "Write",
    edit: "Edit",
    multiedit: "MultiEdit",
    notebookedit: "NotebookEdit",
    create_file: "Write",
    search_replace: "Edit",
    bash: "Bash",
    shell: "Shell",
    shell_command: "Shell",
    exec_command: "Shell",
    exec: "Shell",
    local_shell: "Shell"
  };
  const mapped = map[lower];
  if (mapped) return mapped;
  if (/^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|Bash|Shell)$/.test(toolName)) {
    return toolName;
  }
  return toolName;
}
function isShellTool2(toolName) {
  return typeof toolName === "string" && SHELL_TOOLS.test(toolName);
}

// plugins/workspace-integrity/src/domains/commands/engines/mysql-preflight.ts
function successfulPreflightEvidence(event) {
  const record = isRecord(event) ? event : null;
  const candidates = [
    event,
    record?.mysql_replication_preflight,
    record?.mysqlReplicationPreflight,
    record?.preflight
  ];
  return candidates.some((candidate) => {
    if (!isRecord(candidate)) return false;
    const tool = typeof candidate.tool === "string" && candidate.tool || candidate.tool_name || candidate.toolName;
    const exitCode = candidate.exit_code ?? candidate.exitCode;
    const timedOut = candidate.timed_out ?? candidate.timedOut;
    return tool === "mysql-replication-preflight" && exitCode !== void 0 && exitCode !== null && Number(exitCode) === 0 && timedOut !== true;
  });
}
function replicationMutation(command) {
  for (const { executable: executable2, args } of shellCommandInvocations(command)) {
    if (!["mysql", "mysqlsh"].includes(executable2.toLowerCase())) continue;
    const mutation = args.join(" ").match(
      /\b(?:RESET\s+REPLICA\s+ALL|CHANGE\s+REPLICATION\s+SOURCE\s+TO|STOP\s+REPLICA|SET\s+(?:@@GLOBAL\.|GLOBAL\s+)(?:super_)?read_only\s*=\s*(?:0|OFF))\b/iu
    )?.[0];
    if (mutation) return mutation;
  }
  return null;
}
function mysqlReplicationPreflightFinding(command, event = {}) {
  const mutation = replicationMutation(command);
  if (!mutation) return null;
  if (successfulPreflightEvidence(event)) return null;
  return {
    action: "deny",
    id: "MySQL Replication Failover Guard",
    reason: `missing successful replication preflight evidence: ${mutation}`,
    recovery: "run mysql-replication-preflight first and verify replication threads, lag, and GTID coverage"
  };
}
function mysqlPreflightDenyMessage(finding, command = "") {
  return [
    `[${finding.id}] Blocked`,
    "",
    `Reason: ${finding.reason}`,
    `Recovery/alternative: ${finding.recovery}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: The command matches a high-risk replication state change without successful preflight evidence.",
    "  harm: It could cause an unverifiable primary/replica switchover or data inconsistency.",
    "  unblockWhen: Provide successful mysql-replication-preflight evidence.",
    `  recovery: ${finding.recovery}`
  ].join("\n");
}

// plugins/workspace-integrity/src/domains/commands/engines/secret-read.ts
import { basename as basename3 } from "node:path";
var WHITELIST = [/(?:^|\/)(?:tests?|__tests__|fixtures|testdata|examples?|samples?|templates?|docs?)\//iu, /\.(?:md|rst|adoc)$/iu, /\.env\.(?:example|template|sample|dist)$/iu];
var SENSITIVE = [/(?:^|\/)\.env(?:\.[^.]+)?$/iu, /\.(?:pem|key|p12|pfx|jks|keystore)$/iu, /\bid_(?:rsa|ed25519|ecdsa|dsa)$/iu, /(?:^|\/)\.ssh\//iu, /(?:credentials\.json|service[-_]?account[-_]?key|\.aws\/credentials|\.docker\/config\.json|\.npmrc|\.pypirc|\.netrc|\.git-credentials|htpasswd)$/iu];
function secretReadReport(targets) {
  for (const raw of targets) {
    const path = String(raw).replaceAll("\\", "/");
    if (WHITELIST.some((pattern) => pattern.test(path))) continue;
    if (SENSITIVE.some((pattern) => pattern.test(path)) || /(?:secret|credential|(?:^|[_.-])token[_.-]|passwd|password|api[-_]?key)/iu.test(basename3(path))) return `[Secret Read Notice] Sensitive file read detected

File: ${raw}
Read content may enter the agent context; read only fields required by the task and never echo credentials in output.`;
  }
  return null;
}

// plugins/workspace-integrity/src/domains/commands/lib/deny-state.ts
import { createHash as createHash3 } from "node:crypto";
import { appendFileSync, mkdirSync as mkdirSync3, readFileSync as readFileSync6 } from "node:fs";
import { join as join5, resolve as resolve5 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync5, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join4 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text) {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text) {
  const value = normalizeGitignore(text);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot2) {
  mkdirSync2(pluginRoot2, { recursive: true, mode: 448 });
  const ignore = join4(pluginRoot2, ".gitignore");
  let current = null;
  try {
    current = readFileSync5(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync2(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/workspace-integrity/src/domains/commands/lib/deny-state.ts
var DEFAULT_WINDOW_MS = 10 * 60 * 1e3;
var DEFAULT_THRESHOLD = 3;
var STATE_DIR_RELATIVE = ".command-safety/.state";
function eventCwd2(event) {
  return typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
}
function stateFile(cwd) {
  return join5(resolve5(cwd), STATE_DIR_RELATIVE, "denies.jsonl");
}
function ensureStateFile(event) {
  const cwd = eventCwd2(event);
  const path = stateFile(cwd);
  try {
    const directory = join5(resolve5(cwd), STATE_DIR_RELATIVE);
    mkdirSync3(directory, { recursive: true, mode: 448 });
    ensurePluginWorkdirGitignore(join5(resolve5(cwd), ".command-safety"));
    return path;
  } catch {
    return null;
  }
}
function hash(value) {
  return createHash3("sha256").update(value).digest("hex");
}
function target(event, command) {
  const cwd = eventCwd2(event);
  const tool = isRecord(event.tool) ? event.tool : null;
  const input = tool && isRecord(tool.input) ? tool.input : null;
  const fileTargets = tool && Array.isArray(tool.fileTargets) ? tool.fileTargets : null;
  const direct = input?.file_path ?? input?.filePath ?? input?.path ?? fileTargets?.[0];
  if (direct) return hash(resolve5(cwd, String(direct)));
  const tokens = tokenizeShell(command).filter(
    (token) => ![";", "&&", "||", "|", "&"].includes(token)
  );
  const operation = tokens.find(
    (token) => /^(?:rm|sed|cat|mysql|mysqlsh|redis-cli|nmap|masscan|zmap|ffuf|gobuster|feroxbuster)$/u.test(
      token.split("/").at(-1) ?? ""
    )
  )?.split("/").at(-1) ?? tokens[0] ?? "command";
  const path = [...tokens].reverse().find(
    (token) => !token.startsWith("-") && (/^(?:\/|\.|~|\$)/u.test(token) || token.includes("/"))
  );
  return hash(`${operation}:${path ?? tokens[1] ?? ""}`);
}
function isDenyEntry(value) {
  return isRecord(value) && typeof value.ts === "number";
}
function entries(event) {
  const path = stateFile(eventCwd2(event));
  if (!path) return [];
  try {
    return readFileSync6(path, "utf8").split("\n").filter(Boolean).map((line) => {
      const parsed = JSON.parse(line);
      return parsed;
    }).filter(isDenyEntry);
  } catch {
    return [];
  }
}
function escalationMessage(event, command, options = {}) {
  if (/(?:^|\s)#\s*escalation-ok\b/iu.test(command)) return null;
  const windowMs = typeof options.windowMinutes === "number" && options.windowMinutes > 0 ? options.windowMinutes * 60 * 1e3 : DEFAULT_WINDOW_MS;
  const threshold = typeof options.threshold === "number" && options.threshold > 0 ? options.threshold : DEFAULT_THRESHOLD;
  const key = target(event, command);
  const cutoff = Date.now() - windowMs;
  const currentTurn = event.turn_id ?? event.turnId ?? "";
  const recent = entries(event).filter(
    (entry) => entry.ts >= cutoff && entry.target === key && (!currentTurn || entry.turn !== currentTurn)
  );
  const turns = new Set(recent.map((entry) => entry.turn).filter(Boolean));
  const count2 = Math.max(
    turns.size,
    recent.filter((entry) => !entry.turn).length
  );
  return count2 >= threshold ? `[Deny Escalation Guard] command-safety has denied the same target ${count2} times.

Stop retrying with alternate spellings, reread the denial reason, and satisfy its prerequisites. If this is a false positive, explain the evidence to the user. The count expires after ${options.windowMinutes ?? 10} minutes.` : null;
}
function recordDeny(event, command, hook) {
  const path = ensureStateFile(event);
  if (!path) return;
  try {
    appendFileSync(
      path,
      `${JSON.stringify({
        ts: Date.now(),
        turn: event.turn_id ?? event.turnId ?? "",
        target: target(event, command),
        hook
      })}
`,
      { mode: 384 }
    );
  } catch {
  }
}

// plugins/workspace-integrity/src/domains/commands/engines/dangerous-rm.ts
import { homedir } from "node:os";
import { dirname as dirname3, resolve as resolve6 } from "node:path";
var COMMAND_SEPARATORS3 = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&", "{", "}"]);
var SHELL_COMMANDS = /* @__PURE__ */ new Set(["bash", "dash", "sh", "zsh"]);
function recursiveRmTarget(args, cwd, stdinDriven) {
  const recursive = args.some(
    (argument) => argument === "--recursive" || /^-[^-]*[rR]/u.test(argument) && argument !== "--"
  );
  if (!recursive) return null;
  if (stdinDriven) {
    return "xargs dynamically supplies paths to rm -r, so the deletion scope cannot be proven safe";
  }
  let optionsEnded = false;
  for (const argument of args) {
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) continue;
    const homeReference = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u.test(argument);
    const expanded = argument.replace(/^\$\{HOME\}(?=\/|$)/u, homedir()).replace(/^\$HOME(?=\/|$)/u, homedir()).replace(/^~(?=\/|$)/u, homedir()).replace(/^\$\{PWD\}(?=\/|$)/u, cwd).replace(/^\$PWD(?=\/|$)/u, cwd).replace(/^\$\(pwd\)(?=\/|$)/u, cwd);
    if (/[$`]/u.test(expanded)) {
      return "recursive deletion target contains unresolved shell expansion, so the deletion scope cannot be proven safe";
    }
    const absolute = resolve6(cwd, expanded);
    if (/^\/+$/u.test(expanded)) return "rm -r / would delete the entire filesystem";
    if (absolute === resolve6(cwd) || /^(?:\.\/)?\*+(?:\/\*+)*$/u.test(expanded)) {
      return "rm -r . would delete everything in the current directory";
    }
    if (homeReference || absolute === homedir()) {
      return "rm -r ~ targets the home directory and is extremely dangerous";
    }
    if (dirname3(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
      return "rm -r targeting a top-level directory such as /tmp or /home is extremely dangerous";
    }
  }
  return null;
}
function expandPathToken(argument, cwd) {
  return argument.replace(/^\$\{HOME\}(?=\/|$)/u, homedir()).replace(/^\$HOME(?=\/|$)/u, homedir()).replace(/^~(?=\/|$)/u, homedir()).replace(/^\$\{PWD\}(?=\/|$)/u, cwd).replace(/^\$PWD(?=\/|$)/u, cwd).replace(/^\$\(pwd\)(?=\/|$)/u, cwd);
}
function broadDeleteReason(argument, cwd, verb) {
  const homeReference = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u.test(argument);
  const expanded = expandPathToken(argument, cwd);
  const absolute = resolve6(cwd, expanded);
  if (/^\/+$/u.test(expanded)) return `${verb} / would delete the entire filesystem`;
  if (absolute === resolve6(cwd) || expanded.startsWith("./*") || expanded === ".") {
    return `${verb} . would delete everything in the current directory`;
  }
  if (homeReference || absolute === homedir()) {
    return `${verb} ~ targets the home directory and is extremely dangerous`;
  }
  if (dirname3(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
    return `${verb} targeting a top-level directory such as /tmp or /home is extremely dangerous`;
  }
  return null;
}
function findDeleteReason(args, cwd) {
  if (!args.some((argument) => argument === "-delete")) return null;
  const paths = [];
  let optionsEnded = false;
  for (const argument of args) {
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) continue;
    if (!argument.startsWith("-")) paths.push(argument);
  }
  if (paths.length === 0) {
    return "find -delete without an explicit path defaults to the current directory";
  }
  for (const argument of paths) {
    const reason = broadDeleteReason(argument, cwd, "find -delete");
    if (reason) return reason;
  }
  return null;
}
function dangerousCommandReason(command, cwd, depth = 0) {
  if (depth < 4) {
    for (const nestedCommand of nestedCommandSubstitutions(command)) {
      const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
      if (reason) return reason;
    }
  } else if (hasCommandSubstitution(command)) {
    return "nested command substitutions are too deep to prove the deletion scope safe";
  }
  for (const logicalLine of splitShellLogicalLines(command)) {
    const tokens = tokenizeShell(logicalLine);
    let segment = [];
    for (let index = 0; index <= tokens.length; index += 1) {
      const token = tokens[index];
      if (token !== void 0 && !COMMAND_SEPARATORS3.has(token)) {
        segment.push(token);
        continue;
      }
      const invocation = commandInvocation(segment);
      if (invocation?.executable === "rm") {
        const reason = recursiveRmTarget(
          invocation.args,
          cwd,
          invocation.stdinDriven
        );
        if (reason) return reason;
      }
      if (invocation?.executable === "find") {
        const reason = findDeleteReason(invocation.args, cwd);
        if (reason) return reason;
      }
      if (invocation?.executable === "eval") {
        const nestedCommand = invocation.args.join(" ");
        if (nestedCommand) {
          if (depth >= 4) {
            return "nested eval commands are too deep to prove the deletion scope safe";
          }
          const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
          if (reason) return reason;
        }
      }
      if (invocation && SHELL_COMMANDS.has(invocation.executable)) {
        const commandIndex = invocation.args.findIndex(
          (argument) => /^-[^-]*c/u.test(argument)
        );
        const nestedCommand = commandIndex >= 0 ? invocation.args[commandIndex + 1] : void 0;
        if (commandIndex >= 0 && nestedCommand) {
          if (depth >= 4) {
            return "nested shell -c commands are too deep to prove the deletion scope safe";
          }
          const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
          if (reason) return reason;
        }
      }
      segment = [];
    }
  }
  return null;
}
function hasCommandSubstitution(command) {
  return /\$\(|`/u.test(command);
}
function nestedCommandSubstitutions(command) {
  const nested = [];
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }
    if (char === "'") {
      quote = char;
      continue;
    }
    if (char === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (char === "`") {
      let end2 = index + 1;
      let body2 = "";
      for (; end2 < command.length; end2 += 1) {
        const escaped = command[end2];
        const escapedNext = command[end2 + 1];
        if (escaped === "\\" && escapedNext !== void 0) {
          body2 += escapedNext;
          end2 += 1;
        } else if (escaped === "`") break;
        else if (escaped !== void 0) body2 += escaped;
      }
      if (end2 < command.length) {
        nested.push(body2);
        index = end2;
      }
      continue;
    }
    if (char !== "$" || command[index + 1] !== "(") continue;
    let depth = 1;
    let body = "";
    let nestedQuote = null;
    let end = index + 2;
    for (; end < command.length && depth > 0; end += 1) {
      const current = command[end];
      if (current === void 0) continue;
      if (current === "\\") {
        const nextChar = command[end + 1];
        if (nextChar !== void 0) body += `${current}${nextChar}`;
        end += 1;
        continue;
      }
      if (nestedQuote) {
        if (current === nestedQuote) nestedQuote = null;
        body += current;
        continue;
      }
      if (current === "'" || current === '"') {
        nestedQuote = current;
        body += current;
        continue;
      }
      if (current === "(") depth += 1;
      if (current === ")") depth -= 1;
      if (depth > 0) body += current;
    }
    if (depth === 0) {
      nested.push(body);
      index = end - 1;
    }
  }
  return nested;
}
function dangerousCommandHits(command, cwd = process.cwd()) {
  if (typeof command !== "string" || !command) return [];
  const reason = dangerousCommandReason(command, cwd);
  return reason ? [reason] : [];
}
function dangerousCommandDenyMessage(hits, command = "") {
  const reasons = Array.isArray(hits) ? hits : [];
  return [
    "[Dangerous Command] High-risk command blocked",
    "",
    `Reason: ${reasons.join("; ") || "the command's deletion scope cannot be proven safe"}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: The parsed shell command recursively deletes the filesystem root, home directory, workspace root, or an equivalently broad target.",
    "  harm: Running this command could irreversibly delete user data or the entire working environment.",
    "  unblockWhen: The deletion target resolves to a specific, narrow, verified path, or the destructive command is removed.",
    "  recovery: Resolve the target files first, prefer a recoverable move or trash operation, then retry with an explicit narrow path."
  ].join("\n");
}

// plugins/workspace-integrity/src/domains/commands/engines/verification-integrity.ts
var SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
var DIRECT_VERIFIERS = /* @__PURE__ */ new Set([
  "ava",
  "bats",
  "behat",
  "cypress",
  "go-test",
  "jest",
  "karma",
  "mocha",
  "nose",
  "nosetests",
  "nox",
  "phpunit",
  "playwright",
  "pytest",
  "py.test",
  "rspec",
  "tox",
  "vitest"
]);
function shellSegments(command) {
  const normalized = sanitizeCommand(command).replace(/\b\d*>\s*&\s*\d+\b/gu, " __FD_REDIRECT__ ").replace(/(?:^|\s)&>\s*\S+/gu, " __FD_REDIRECT__ ");
  const tokens = tokenizeShell(normalized);
  const segments = [];
  let current = [];
  for (const token of tokens) {
    if (!SEPARATORS.has(token)) {
      current.push(token);
      continue;
    }
    segments.push({ tokens: current, next: token });
    current = [];
  }
  segments.push({ tokens: current, next: null });
  return segments;
}
function isVerificationInvocation(executable2, args) {
  const program = executable2.toLowerCase();
  if (DIRECT_VERIFIERS.has(program)) return true;
  if (program === "python" || /^python\d+(?:\.\d+)?$/u.test(program)) {
    if (args.some((arg) => /(?:^|\/)runtests\.py$/iu.test(arg))) return true;
    const moduleIndex = args.findIndex((arg) => arg === "-m");
    return moduleIndex >= 0 && /^(?:pytest|unittest|nose|tox)$/iu.test(args[moduleIndex + 1] ?? "");
  }
  if (program === "node") return args.includes("--test");
  if (["npm", "pnpm", "yarn", "bun"].includes(program)) {
    const positional = args.filter((arg) => !arg.startsWith("-"));
    return positional[0] === "test" || positional[0] === "run" && /^test(?::|$)/u.test(positional[1] ?? "");
  }
  if (program === "go") return args[0] === "test";
  if (program === "cargo" || program === "dotnet" || program === "swift" || program === "mix") {
    return args[0] === "test";
  }
  if (["gradle", "gradlew", "mvn", "mvnw", "make"].includes(program)) {
    return args.some((arg) => /^(?:check|test)(?::|$)/iu.test(arg));
  }
  return false;
}
function nestedShellFinding(tokens) {
  const invocation = commandInvocation(tokens);
  if (!invocation || !["bash", "sh", "zsh", "dash", "ksh"].includes(invocation.executable.toLowerCase())) return null;
  const commandIndex = invocation.args.findIndex((arg) => arg === "-c" || arg === "-lc");
  if (commandIndex < 0 || !invocation.args[commandIndex + 1]) return null;
  const pipefail = invocation.args.some((arg, index) => arg === "pipefail" && invocation.args[index - 1] === "-o");
  const errexit = invocation.args.includes("-e") || invocation.args.some((arg, index) => arg === "errexit" && invocation.args[index - 1] === "-o");
  return analyze(invocation.args[commandIndex + 1] ?? "", { pipefail, errexit });
}
function analyze(command, inherited = {}) {
  const segments = shellSegments(command);
  let pipefail = Boolean(inherited.pipefail);
  let errexit = Boolean(inherited.errexit);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const joined = segment.tokens.join(" ");
    if (/^set\s+(?:-[^\s]*e[^\s]*|-o\s+errexit)\b/u.test(joined)) errexit = true;
    if (/^set\s+-o\s+pipefail\b/u.test(joined)) pipefail = true;
    const nested = nestedShellFinding(segment.tokens);
    if (nested) return nested;
    const invocation = commandInvocation(segment.tokens);
    if (!invocation || !isVerificationInvocation(invocation.executable, invocation.args)) continue;
    const verifier = invocation.executable;
    let end = index;
    while (segments[end]?.next === "|") end += 1;
    const piped = end > index;
    if (piped && !pipefail) return { operator: "pipeline", verifier };
    const outgoing = segments[end]?.next;
    if (outgoing === "||") return { operator: "fallback", verifier };
    if (outgoing === "&") return { operator: "background", verifier };
    if (outgoing === ";" && !errexit) return { operator: "sequence", verifier };
    if (outgoing === "&&") {
      let cursor = end;
      while (segments[cursor]?.next === "&&") cursor += 1;
      if (segments[cursor]?.next === "||") return { operator: "fallback", verifier };
    }
  }
  return null;
}
function verificationIntegrityFinding(command) {
  if (typeof command !== "string" || !command.trim()) return null;
  return analyze(command);
}
function verificationIntegrityDenyMessage(finding, command) {
  return [
    "[Verification Integrity Guard] Blocked",
    "",
    `Reason: the ${finding.verifier} verification is followed by a shell ${finding.operator} that can replace or hide its exit status.`,
    "Recovery/alternative: run the verification command directly. If output must be piped, enable pipefail in the same shell (for example `set -o pipefail; <test> | tee /tmp/test.log`). Chain later inspection with `&&`, or preserve and re-exit the original status explicitly.",
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: a test or verification command is composed so the shell can report a later command's status instead of the verifier's status.",
    "  harm: a failing test can be recorded as successful evidence and support a false completion claim.",
    "  unblockWhen: the verifier's native nonzero status is the status observed by the host, including through any output pipeline.",
    "  recovery: rerun directly, use `set -o pipefail` for a pipeline, use `&&` for success-only follow-up, or explicitly exit with the captured verifier status."
  ].join("\n");
}

// plugins/workspace-integrity/src/domains/commands/entries/hooks/cmd-safety-hook-pre-tool.ts
async function main2() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const toolName = normalizeToolName(eventToolName(event));
  const toolInput = eventToolInput(event);
  const cwd = eventCwd(event);
  const repoRoot2 = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot2);
  const { rules, settings } = resolveRules(userConfig);
  if (/^Read$/iu.test(toolName)) {
    if (settings.engines.secretRead !== false) {
      const tool = isRecord(event.tool) ? event.tool : null;
      const extraTargets = Array.isArray(tool?.fileTargets) ? tool.fileTargets : [];
      const report = secretReadReport(
        [
          toolInput.file_path,
          toolInput.filePath,
          toolInput.path,
          ...extraTargets
        ].filter(Boolean)
      );
      if (report) writeJson(additionalContextOutput("PreToolUse", report));
    }
    return;
  }
  if (!isShellTool2(toolName)) return;
  const command = extractShellCommand2(toolName, toolInput) ?? "";
  if (!command) return;
  if (settings.engines.denyEscalation !== false) {
    const escalation = escalationMessage(event, command, settings.escalation);
    if (escalation) {
      writeJson(preToolDeny(escalation));
      return;
    }
  }
  if (settings.engines.dangerousRm !== false) {
    const dangerousHits = dangerousCommandHits(command, cwd);
    if (dangerousHits.length > 0) {
      recordDeny(event, command, "dangerous-rm");
      writeJson(
        preToolDeny(dangerousCommandDenyMessage(dangerousHits, command))
      );
      return;
    }
  }
  const hit = matchRule(command, rules);
  if (hit) {
    if (hit.mode === "allow") return;
    if (hit.mode === "deny") {
      recordDeny(event, command, hit.id || "command-rule");
      writeJson(preToolDeny(formatFinding(hit, command, { host: process.env.HARNESS_HOST })));
      return;
    }
    if (hit.mode === "report") {
      writeJson(
        additionalContextOutput("PreToolUse", formatFinding(hit, command, { host: process.env.HARNESS_HOST }))
      );
      return;
    }
  }
  if (settings.engines.verificationIntegrity !== false) {
    const verification = verificationIntegrityFinding(command);
    if (verification) {
      recordDeny(event, command, "verification-integrity");
      writeJson(preToolDeny(verificationIntegrityDenyMessage(verification, command)));
      return;
    }
  }
  if (settings.engines.mysqlReplicationPreflight !== false) {
    const mysql = mysqlReplicationPreflightFinding(command, event);
    if (mysql) {
      recordDeny(event, command, mysql.id);
      writeJson(preToolDeny(mysqlPreflightDenyMessage(mysql, command)));
      return;
    }
  }
}

// plugins/workspace-integrity/src/domains/go/policy.ts
var policy2 = {
  plugin: "go-engineering",
  displayName: "Go Engineering",
  protections: [
    { id: "go-module-checksums", match: /(?:^|\/)go\.sum$/iu, reason: "go.sum is generated by the Go module toolchain.", recovery: "Change go.mod or imports and regenerate checksums with Go module commands." }
  ],
  validators: [
    { id: "gofmt", enforcement: "advisory", kind: "gofmt", match: /\.go$/iu, mode: "report" }
  ]
};

// plugins/workspace-integrity/src/domains/ios/policy.ts
function concurrencyEscapeHits(_filePath, source) {
  const patterns = [
    { pattern: /@unchecked\s+Sendable\b/u, code: "SWIFT_UNCHECKED_SENDABLE", message: "Document and verify the synchronization invariant behind @unchecked Sendable." },
    { pattern: /\bnonisolated\s*\(\s*unsafe\s*\)/u, code: "SWIFT_NONISOLATED_UNSAFE", message: "Avoid unsafe isolation escape or document the external synchronization invariant." },
    { pattern: /\bTask\s*\.\s*detached\s*\{/u, code: "SWIFT_TASK_DETACHED", message: "Prefer structured tasks unless detached executor and lifetime ownership are required." }
  ];
  let blockComment = false;
  return source.split(/\r?\n/u).flatMap((raw, index) => {
    let line = raw;
    if (blockComment) {
      const end = line.indexOf("*/");
      if (end < 0) return [];
      line = line.slice(end + 2);
      blockComment = false;
    }
    line = line.replace(/\/\*[\s\S]*?\*\//gu, "");
    if (line.includes("/*")) {
      line = line.slice(0, line.indexOf("/*"));
      blockComment = true;
    }
    line = line.replace(/"(?:\\.|[^"\\])*"/gu, '""').replace(/\/\/.*$/u, "");
    return patterns.flatMap(({ pattern, code, message }) => pattern.test(line) ? [{ line: index + 1, code, message }] : []);
  });
}
var policy3 = {
  plugin: "ios-engineering",
  displayName: "iOS Engineering",
  protections: [
    { id: "ios-lockfiles", match: /(?:^|\/)(?:Package\.resolved|Podfile\.lock)$/iu, reason: "Apple dependency lockfiles are generated by SwiftPM or CocoaPods.", recovery: "Change Package.swift or Podfile and regenerate with the dependency manager." },
    { id: "ios-dependency-directories", match: /(?:^|\/)(?:Pods|Carthage\/Build|\.build\/checkouts)(?:\/|$)/iu, reason: "The target is inside an iOS dependency directory.", recovery: "Change declarations or sources, then reinstall dependencies." }
  ],
  validators: [
    { id: "swiftParse", enforcement: "deterministic", kind: "swift", match: /\.swift$/iu, mode: "block" },
    { id: "plistLint", enforcement: "deterministic", kind: "plist", match: /\.plist$/iu, mode: "block" }
  ],
  sourceScans: [
    { id: "swiftConcurrencyEscapes", enforcement: "advisory", match: /\.swift$/iu, mode: "report", inspect: concurrencyEscapeHits }
  ]
};

// plugins/workspace-integrity/src/domains/java/policy.ts
import { existsSync as existsSync4, readFileSync as readFileSync7 } from "node:fs";
import { dirname as dirname4, join as join6 } from "node:path";
function jakartaBuildEvidence(filePath) {
  let directory = dirname4(filePath);
  while (true) {
    for (const name of ["pom.xml", "build.gradle", "build.gradle.kts"]) {
      const candidate = join6(directory, name);
      if (!existsSync4(candidate)) continue;
      try {
        const build = readFileSync7(candidate, "utf8");
        return /spring-boot(?:-starter-parent)?[\s\S]{0,600}(?:<version>\s*3\.|version\s*[=( ]\s*["']3\.)/iu.test(build) || /<spring-boot\.version>\s*3\./iu.test(build) || /\bid\s*["']org\.springframework\.boot["']\s+version\s+["']3\./iu.test(build) || /jakarta\.(?:annotation|inject|persistence|servlet|validation|ws\.rs)(?:-api)?/iu.test(build);
      } catch {
        return false;
      }
    }
    const parent = dirname4(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}
function legacyJavaxHits(filePath, source) {
  if (!jakartaBuildEvidence(filePath)) return [];
  return source.split(/\r?\n/u).flatMap((raw, index) => {
    const line = raw.replace(/"(?:\\.|[^"\\])*"/gu, '""').replace(/\/\/.*$/u, "");
    return /^\s*import\s+javax\.(?:annotation|inject|persistence|servlet|validation|ws\.rs)\b/u.test(line) ? [{ line: index + 1, code: "LEGACY_JAVAX_ON_JAKARTA", message: "This build targets a Jakarta generation; migrate the affected javax namespace and its dependency together." }] : [];
  });
}
var policy4 = {
  plugin: "java-engineering",
  displayName: "Java Engineering",
  active: (context) => /(?:^|\/)pom\.xml$/iu.test(context.relativePath) || !repoContainsPath(context.root, /(?:^|\/)AndroidManifest\.xml$/iu),
  protections: [
    { id: "java-gradle-locks", match: /(?:^|\/)gradle\.lockfile$|(?:^|\/)gradle\/dependency-locks\/[^/]+\.lockfile$/iu, reason: "JVM dependency locks are generated by Gradle.", recovery: "Change Gradle declarations and regenerate locks through the wrapper." },
    { id: "java-gradle-cache", match: /(?:^|\/)\.gradle(?:\/|$)/iu, reason: "The Gradle cache is tool-owned.", recovery: "Change sources or declarations and let Gradle rebuild the cache." }
  ],
  validators: [
    { id: "mavenXml", enforcement: "deterministic", kind: "xml", match: /(?:^|\/)pom\.xml$/iu, mode: "block" }
  ],
  sourceScans: [
    { id: "legacyJavaxOnJakarta", enforcement: "advisory", match: /\.java$/iu, mode: "report", inspect: legacyJavaxHits }
  ]
};

// plugins/workspace-integrity/src/domains/kubernetes/policy.ts
function mutableImage(value) {
  const image = value.trim().replace(/^['"]|['"]$/gu, "");
  if (!image || image.includes("@sha256:")) return false;
  const leaf = image.split("/").at(-1) ?? image;
  return !leaf.includes(":") || /:latest$/iu.test(leaf);
}
function riskyDefaultsHits(_filePath, source) {
  return source.split(/\r?\n/u).flatMap((raw, index) => {
    const line = raw.replace(/\s+#.*$/u, "");
    if (/^\s*(?:hostIPC|hostNetwork|hostPID)\s*:\s*true\s*$/iu.test(line)) {
      return [{ line: index + 1, code: "K8S_HOST_NAMESPACE", message: "Host namespaces broaden workload access; require an explicit operational need and compensating controls." }];
    }
    const image = line.match(/^\s*-?\s*image\s*:\s*(?<value>\S.*?)\s*$/iu)?.groups?.value;
    if (image && mutableImage(image)) {
      return [{ line: index + 1, code: "K8S_MUTABLE_IMAGE", message: "Pin the workload image to an immutable digest or a governed non-latest tag." }];
    }
    if (/^\s*privileged\s*:\s*true\s*$/iu.test(line)) {
      return [{ line: index + 1, code: "K8S_PRIVILEGED", message: "Privileged containers bypass normal isolation; remove it or document the bounded requirement." }];
    }
    if (/^\s*allowPrivilegeEscalation\s*:\s*true\s*$/iu.test(line)) {
      return [{ line: index + 1, code: "K8S_PRIVILEGE_ESCALATION", message: "Disable privilege escalation unless the workload has a verified requirement." }];
    }
    return [];
  });
}
var policy5 = {
  plugin: "kubernetes-operations",
  displayName: "Kubernetes Operations",
  protections: [
    { id: "helm-lock", match: /(?:^|\/)Chart\.lock$/iu, reason: "Chart.lock is generated by Helm dependency management.", recovery: "Change Chart.yaml and regenerate dependencies with Helm." },
    { id: "helm-vendored-charts", match: /(?:^|\/)charts(?:\/|$)/iu, reason: "Vendored Helm charts are dependency-manager-owned.", recovery: "Change Chart.yaml and use Helm dependency commands." }
  ],
  validators: [
    { id: "kubernetesDryRun", enforcement: "advisory", kind: "kubectl", match: /\.ya?ml$/iu, contentMatch: /^\s*apiVersion\s*:[\s\S]*^\s*kind\s*:/imu, mode: "report" },
    { id: "helmLint", enforcement: "advisory", kind: "helm", match: /(?:^|\/)Chart\.yaml$/iu, mode: "report" },
    { id: "kubernetesJson", enforcement: "deterministic", kind: "json", match: /\.json$/iu, mode: "block" }
  ],
  sourceScans: [
    { id: "kubernetesRiskyDefaults", enforcement: "advisory", match: /\.ya?ml$/iu, mode: "report", inspect: riskyDefaultsHits }
  ]
};

// plugins/workspace-integrity/src/domains/nix/policy.ts
var policy6 = {
  plugin: "nix-engineering",
  displayName: "Nix Engineering",
  protections: [
    { id: "nix-flake-lock", match: /(?:^|\/)flake\.lock$/iu, reason: "flake.lock is generated by Nix flake commands.", recovery: "Change flake inputs and regenerate the lock with Nix." }
  ],
  validators: [
    { id: "nixParse", enforcement: "deterministic", kind: "nix", match: /\.nix$/iu, mode: "block" },
    { id: "flakeJson", enforcement: "deterministic", kind: "json", match: /(?:^|\/)flake\.lock$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/php/policy.ts
var policy7 = {
  plugin: "php-engineering",
  displayName: "PHP Engineering",
  protections: [
    { id: "composer-lock", match: /(?:^|\/)composer\.lock$/iu, reason: "composer.lock is generated by Composer.", recovery: "Change composer.json and regenerate the lock with Composer." },
    { id: "composer-vendor", match: /(?:^|\/)vendor(?:\/|$)/iu, reason: "vendor is owned by Composer.", recovery: "Change project sources or declarations and reinstall dependencies." }
  ],
  validators: [
    { id: "phpSyntax", enforcement: "deterministic", kind: "php", match: /\.php$/iu, mode: "block" },
    { id: "composerValidate", enforcement: "deterministic", kind: "composer", match: /(?:^|\/)composer\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/python/policy.ts
var policy8 = {
  plugin: "python-engineering",
  displayName: "Python Engineering",
  protections: [
    { id: "python-lockfiles", match: /(?:^|\/)(?:pdm\.lock|Pipfile\.lock|poetry\.lock|uv\.lock)$/iu, reason: "Python lockfiles are generated by package managers.", recovery: "Change pyproject.toml or the relevant declaration and regenerate the lock." },
    { id: "python-environments", match: /(?:^|\/)(?:\.venv|venv|__pypackages__)(?:\/|$)/iu, reason: "Python environments are package-manager-owned.", recovery: "Change sources or declarations and recreate the environment." }
  ],
  validators: [
    { id: "pythonSyntax", enforcement: "deterministic", kind: "python", match: /\.py$/iu, mode: "block" },
    { id: "ruff", enforcement: "advisory", kind: "ruff", match: /\.py$/iu, mode: "report" },
    { id: "pythonJson", enforcement: "deterministic", kind: "json", match: /\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/quality/entries/hooks/engineering-quality-post.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { fileURLToPath } from "node:url";
var checks = ["line-budget-check.mjs", "markdown-check.mjs"];
function runChecks(input, phase) {
  let exitCode = 0;
  for (const check of phase === "post" ? checks : checks.slice(0, 1)) {
    const entry = fileURLToPath(new URL(`./${check}`, import.meta.url));
    const result = spawnSync2(process.execPath, [entry, phase], {
      env: process.env,
      input,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) process.stderr.write(`[engineering-quality] ${check}: ${result.error.message}
`);
    if ((result.status ?? 0) !== 0) exitCode = 2;
  }
  return exitCode;
}

// plugins/workspace-integrity/src/domains/react-native/policy.ts
var policy9 = {
  plugin: "react-native-engineering",
  displayName: "React Native Engineering",
  active: (context) => packageDeclaresDependency(context, "react-native") || /(?:^|\/)(?:NativeComponent\.g\.(?:h|mm)|android\/.+\/build\/generated\/source\/codegen|ios\/build\/generated\/ios)(?:\/|$)/iu.test(context.relativePath),
  protections: [
    { id: "react-native-lockfiles", match: /(?:^|\/)(?:bun\.lockb?|npm-shrinkwrap\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/iu, reason: "React Native JavaScript lockfiles are generated by package managers.", recovery: "Change package.json and regenerate the lock with the project's package manager." },
    { id: "react-native-dependencies", match: /(?:^|\/)node_modules(?:\/|$)/iu, reason: "node_modules is package-manager-owned.", recovery: "Change sources or declarations and reinstall dependencies." },
    { id: "react-native-codegen", match: /(?:^|\/)(?:NativeComponent\.g\.(?:h|mm)|android\/.+\/build\/generated\/source\/codegen|ios\/build\/generated\/ios)(?:\/|$)/iu, reason: "React Native Codegen output is generated from schemas.", recovery: "Change the schema or native component source and rerun Codegen." }
  ],
  validators: [
    { id: "reactNativeConfig", enforcement: "deterministic", kind: "javascript", match: /(?:^|\/)(?:metro|babel|react-native)\.config\.(?:c?js|mjs)$/iu, mode: "block" },
    { id: "reactNativeTypescript", enforcement: "deterministic", kind: "typescript", match: /\.(?:ts|tsx)$/iu, mode: "block" },
    { id: "reactNativeJson", enforcement: "deterministic", kind: "json", match: /(?:^|\/)(?:package|app)\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/rust/policy.ts
function unexplainedUnsafeHits(_filePath, source) {
  const lines = source.split(/\r?\n/u);
  return lines.flatMap((raw, index) => {
    const codeOnly = raw.replace(/"(?:\\.|[^"\\])*"/gu, '""').replace(/\/\/.*$/u, "");
    const occurrences = [...codeOnly.matchAll(/\bunsafe\s+(?:fn\b|\{)/gu)];
    if (!occurrences.length) return [];
    const context = lines.slice(Math.max(0, index - 3), index + 1).join("\n");
    if (/\bSAFETY\s*:/u.test(context)) return [];
    return occurrences.map(() => ({ line: index + 1, code: "UNEXPLAINED_UNSAFE", message: "Document the local SAFETY invariant immediately above the unsafe function or block." }));
  });
}
var policy10 = {
  plugin: "rust-engineering",
  displayName: "Rust Engineering",
  protections: [
    { id: "cargo-lock", match: /(?:^|\/)Cargo\.lock$/iu, reason: "Cargo.lock is generated by Cargo.", recovery: "Change Cargo.toml and regenerate the lock with Cargo." }
  ],
  validators: [
    { id: "rustfmt", enforcement: "advisory", kind: "rustfmt", match: /\.rs$/iu, mode: "report" }
  ],
  sourceScans: [
    { id: "unsafeWithoutSafety", enforcement: "advisory", match: /\.rs$/iu, mode: "report", inspect: unexplainedUnsafeHits }
  ]
};

// plugins/workspace-integrity/src/domains/source/entries/hooks/source-integrity.ts
import { execFileSync as execFileSync3 } from "node:child_process";
import { existsSync as existsSync6 } from "node:fs";
import { isAbsolute as isAbsolute4, join as join8, relative as relative3, resolve as resolve8 } from "node:path";
import { pathToFileURL as pathToFileURL4 } from "node:url";

// plugins/workspace-integrity/src/domains/source/lib/source-sanity-policy.ts
var CHECK_NAMES = [
  "backupArtifact",
  "garbledText"
];
var DEFAULT_CHECKS = Object.freeze({
  backupArtifact: "block",
  garbledText: "block"
});
function isCheckMode(value) {
  return value === "block" || value === "report" || value === "off";
}
var SKIP_PATH2 = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var SOURCE_PATH = /(?:^|\/)(?:app|client|cmd|components|include|internal|lib|packages|pkg|server|src|tests?)(?:\/|$)/iu;
var BACKUP_SUFFIX = /(?:\.bak|\.backup|\.old|\.orig|\.rej|\.swp|\.temp|\.tmp|~)$/iu;
var TEXT_PATH = /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;
function warnDefault(message) {
  process.stderr.write(`[source-integrity] ${message}
`);
}
function normalizeMode(value, fallback, label, warn3) {
  if (value === void 0) return fallback;
  if (isCheckMode(value)) return value;
  warn3(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function resolveConfig(userConfig, warn3 = warnDefault) {
  const record = isRecord(userConfig) ? userConfig : void 0;
  const checks2 = { ...DEFAULT_CHECKS };
  if (record?.checks !== void 0 && (!record.checks || typeof record.checks !== "object" || Array.isArray(record.checks))) {
    warn3('config "checks" must be an object; using defaults');
  } else {
    const checksSource = isRecord(record?.checks) ? record.checks : void 0;
    for (const name of CHECK_NAMES) {
      checks2[name] = normalizeMode(
        checksSource?.[name],
        checks2[name],
        `checks.${name}`,
        warn3
      );
    }
  }
  const overrides = [];
  if (record?.overrides !== void 0 && !Array.isArray(record.overrides)) {
    warn3('config "overrides" must be an array; ignoring overrides');
  } else {
    const rawOverrides = Array.isArray(record?.overrides) ? record.overrides : [];
    for (const [index, override] of rawOverrides.entries()) {
      if (!isRecord(override) || !(override.match instanceof RegExp)) {
        warn3(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn3(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      const overrideChecks = isRecord(override.checks) ? override.checks : {};
      const normalizedChecks = {};
      for (const name of CHECK_NAMES) {
        if (overrideChecks[name] === void 0) continue;
        const mode = normalizeMode(
          overrideChecks[name],
          null,
          `override[${index}].checks.${name}`,
          warn3
        );
        if (mode) normalizedChecks[name] = mode;
      }
      if (Object.keys(normalizedChecks).length === 0) {
        warn3(`override[${index}] has no valid checks; skipping`);
        continue;
      }
      overrides.push({ match: override.match, checks: normalizedChecks });
    }
  }
  return { checks: checks2, overrides };
}
function regexMatches2(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}
function modeFor(checkName, relativePath3, config) {
  for (const override of config.overrides) {
    const mode = override.checks[checkName];
    if (mode !== void 0 && regexMatches2(override.match, relativePath3)) {
      return mode;
    }
  }
  return config.checks[checkName] ?? "off";
}
function isBuiltInSkippedPath(relativePath3) {
  return SKIP_PATH2.test(relativePath3);
}
function isBackupArtifactPath(relativePath3) {
  return SOURCE_PATH.test(relativePath3) && BACKUP_SUFFIX.test(relativePath3);
}
function isTextPath(relativePath3) {
  return TEXT_PATH.test(relativePath3);
}
function analyzeGarbledText(text) {
  if (typeof text !== "string" || !text.includes("\uFFFD")) return null;
  const total = [...text].filter((character) => character === "\uFFFD").length;
  if (/\uFFFD{2,}/u.test(text) || total >= 3) {
    return { replacementCharacters: total };
  }
  return null;
}

// plugins/workspace-integrity/src/domains/source/lib/encoding-runner.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { existsSync as existsSync5, readFileSync as readFileSync8, statSync as statSync2 } from "node:fs";
import { dirname as dirname5, isAbsolute as isAbsolute3, join as join7, relative as relative2, resolve as resolve7 } from "node:path";
import { pathToFileURL as pathToFileURL3 } from "node:url";

// plugins/workspace-integrity/src/domains/source/lib/encoding-policy.ts
import { isUtf8 } from "node:buffer";
var BOM_SIGNATURES = [
  { name: "UTF-32 LE BOM", bytes: [255, 254, 0, 0] },
  { name: "UTF-32 BE BOM", bytes: [0, 0, 254, 255] },
  { name: "UTF-8 BOM", bytes: [239, 187, 191] },
  { name: "UTF-16 LE BOM", bytes: [255, 254] },
  { name: "UTF-16 BE BOM", bytes: [254, 255] }
];
function startsWithBytes(buffer, signature) {
  return buffer.length >= signature.length && signature.every((value, index) => buffer[index] === value);
}
function analyzeEncoding(buffer) {
  if (!buffer || buffer.length === 0) return null;
  for (const signature of BOM_SIGNATURES) {
    if (startsWithBytes(buffer, signature.bytes)) {
      return {
        kind: "bom",
        name: signature.name,
        bytes: signature.bytes.map((value) => value.toString(16).toUpperCase().padStart(2, "0")).join(" ")
      };
    }
  }
  if (!isUtf8(buffer)) {
    return { kind: "invalid-utf8" };
  }
  return null;
}

// plugins/workspace-integrity/src/domains/source/lib/encoding-runner.ts
var MAX_FILE_BYTES2 = 2 * 1024 * 1024;
var CONFIG_FILE_NAME = ".source-integrity.mjs";
var BUILTIN_RULES2 = [
  {
    match: /(^|\/)(?:node_modules|vendor|dist|build|coverage|target|\.next|\.nuxt|generated|__generated__)\//u,
    mode: "skip"
  },
  {
    match: /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|inl|ipp|tpp|ixx|cppm|cs|go|java|kt|kts|php|twig|py|r|rb|rs|swift|ts|tsx|js|jsx|mjs|cjs)$/iu,
    mode: "block"
  },
  {
    match: /\.(?:graphql|gql|vue|svelte|html|htm|css|scss|less|sass|svg|ejs|hbs|wxml|wxss|wxs)$/iu,
    mode: "block"
  },
  {
    match: /\.(?:json|yaml|yml|toml|ini|cfg|sh|bash|zsh|fish|lua|pl|pm|md|txt|rst|adoc|xml|xsl|xsd|sql)$/iu,
    mode: "block"
  },
  {
    match: /(^|\/)(?:\.dockerignore|\.editorconfig|\.env|\.gitignore)$/iu,
    mode: "block"
  },
  { match: /(^|\/)\.env\.[^/]+$/iu, mode: "block" }
];
function warnConfig(message) {
  process.stderr.write(`[source-integrity] ${message}
`);
}
function normalizeUserRule(rule, index, warn3 = warnConfig) {
  if (!isRecord(rule) || !(rule.match instanceof RegExp)) {
    warn3(`rule[${index}]: "match" must be a RegExp, skipping`);
    return null;
  }
  const mode = rule.mode ?? "block";
  if (mode !== "block" && mode !== "skip") {
    warn3(`rule[${index}]: "mode" must be "block" or "skip", skipping`);
    return null;
  }
  return { match: rule.match, mode };
}
function resolveRules2(userConfig, warn3 = warnConfig) {
  const record = isRecord(userConfig) ? userConfig : void 0;
  if (record?.rules !== void 0 && !Array.isArray(record.rules)) {
    warn3('config "rules" must be an array; using built-in rules');
    return [...BUILTIN_RULES2];
  }
  const userRules = (Array.isArray(record?.rules) ? record.rules : []).map((rule, index) => normalizeUserRule(rule, index, warn3)).filter((rule) => rule !== null);
  return [...userRules, ...BUILTIN_RULES2];
}
function matchRule2(relativePath3, rules) {
  for (const rule of rules) {
    try {
      if (new RegExp(rule.match.source, rule.match.flags).test(relativePath3)) {
        return rule;
      }
    } catch {
      continue;
    }
  }
  return null;
}
async function loadUserConfig2(repoRoot2) {
  const configPath = join7(repoRoot2, CONFIG_FILE_NAME);
  if (!existsSync5(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL3(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warnConfig(`failed to load ${CONFIG_FILE_NAME}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function extractFilePaths(event) {
  const cwd = eventCwd(event);
  const paths = extractFileTargets(event, {
    tools: eventToolName(event) ? "mutation" : "any",
    includeShellWrites: true
  });
  const command = extractShellCommand({ ...event, tool_name: eventToolName(event) || "Bash", tool_input: eventToolInput(event) }) ?? "";
  for (const match of command.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) {
    const raw = match[1];
    if (raw) paths.push(isAbsolute3(raw) ? resolve7(raw) : resolve7(cwd, raw.replace(/^\.\//u, "")));
  }
  return [...new Set(paths)];
}
function resolveRepoRoot2(filePath) {
  try {
    return execFileSync2("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname5(filePath),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
}
function relativeMatchPath(filePath, repoRoot2, cwd) {
  if (repoRoot2) return relative2(repoRoot2, filePath).replaceAll("\\", "/");
  const fromCwd = relative2(cwd, filePath).replaceAll("\\", "/");
  return fromCwd.startsWith("../") ? filePath.replaceAll("\\", "/") : fromCwd;
}
function readFileCapped(filePath) {
  try {
    if (statSync2(filePath).size > MAX_FILE_BYTES2) return null;
    return readFileSync8(filePath);
  } catch {
    return null;
  }
}
function formatIssue(issue) {
  if (issue.kind === "bom") {
    return `Detected ${issue.name} (${issue.bytes})`;
  }
  return "Detected an invalid UTF-8 byte sequence";
}
function block(findings) {
  const details = findings.flatMap(({ path, issue }) => [
    `- ${path}`,
    `  ${formatIssue(issue)}`
  ]);
  process.stderr.write(
    [
      "[Encoding Guard] Prohibited file encoding detected",
      ...details,
      "",
      "blockingContract:",
      "  observedFacts: A target text file contains a BOM or is not strict UTF-8.",
      "  harm: Incorrect encodings can cause cross-platform parsing differences, garbled text, or build failures.",
      "  unblockWhen: Every listed file is saved as UTF-8 without a BOM.",
      "  recovery: For a UTF-8 BOM, remove only the leading signature; for other encodings, confirm the source encoding and convert losslessly instead of guessing with replacement characters.",
      ""
    ].join("\n")
  );
  process.exitCode = 2;
}
async function runEncodingPost(event) {
  const cwd = eventCwd(event);
  const candidates = extractFilePaths(event).filter(existsSync5);
  if (candidates.length === 0) return;
  const firstCandidate = candidates[0];
  if (!firstCandidate) return;
  const repoRoot2 = resolveRepoRoot2(firstCandidate);
  const userConfig = repoRoot2 ? await loadUserConfig2(repoRoot2) : null;
  const rules = resolveRules2(userConfig);
  const findings = [];
  for (const filePath of candidates) {
    const matchPath = relativeMatchPath(filePath, repoRoot2, cwd);
    const rule = matchRule2(matchPath, rules);
    if (!rule || rule.mode === "skip") continue;
    const buffer = readFileCapped(filePath);
    if (buffer === null) continue;
    const issue = analyzeEncoding(buffer);
    if (issue) findings.push({ path: matchPath, issue });
    if (findings.length >= 10) break;
  }
  if (findings.length > 0) block(findings);
}

// plugins/workspace-integrity/src/domains/source/entries/hooks/source-integrity.ts
var CONFIG_FILE_NAME2 = ".source-integrity.mjs";
var COMMAND_SEPARATORS4 = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
var SIMPLE_WRAPPERS2 = /* @__PURE__ */ new Set(["busybox", "command", "exec", "nohup", "time"]);
function splitSimpleCommands2(tokens) {
  const commands = [];
  let current = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS4.has(token)) {
      if (current.length) commands.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) commands.push(current);
  return commands;
}
function tokenBasename3(token) {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}
function unwrapCommand2(tokens) {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === void 0) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename3(token);
    if (SIMPLE_WRAPPERS2.has(name)) {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-") || option === "--") break;
        index += 1;
      }
      if (tokens[index] === "--") index += 1;
      continue;
    }
    if (name === "sudo") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-")) break;
        index += 1;
        if (["-C", "-g", "-u", "--group", "--user"].includes(option)) index += 1;
      }
      continue;
    }
    if (name === "env") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-")) break;
        index += 1;
      }
      continue;
    }
    if (name === "timeout") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-")) break;
        index += 1;
        if (["-k", "-s", "--kill-after", "--signal"].includes(option)) index += 1;
      }
      const duration = tokens[index];
      if (duration !== void 0 && !duration.startsWith("-")) index += 1;
      continue;
    }
    if (name === "nice" || name === "stdbuf") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-")) break;
        index += 1;
      }
      continue;
    }
    break;
  }
  return tokens.slice(index);
}
function nonFlagOperands2(args) {
  const operands = [];
  let skipNext = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === void 0) continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") {
      operands.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith("-")) {
      if (arg === "-t" || arg === "--target-directory") skipNext = true;
      continue;
    }
    operands.push(arg);
  }
  return operands;
}
function targetDirectory2(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === void 0) continue;
    if (arg === "-t" || arg === "--target-directory") {
      return args[index + 1] ?? "";
    }
    if (arg.startsWith("--target-directory=")) {
      return arg.slice("--target-directory=".length);
    }
  }
  return "";
}
function copyDestTargets(args) {
  const dest = targetDirectory2(args);
  if (dest) return [dest];
  const operands = nonFlagOperands2(args);
  const last = operands.at(-1);
  return last === void 0 ? [] : [last];
}
function moveWriteTargets(args) {
  const dest = targetDirectory2(args);
  const operands = nonFlagOperands2(args);
  return dest ? [dest, ...operands] : operands;
}
function looksLikeSedScript(token) {
  return /(?:^|[0-9,${}]*[!]*s)[/#@|]./u.test(token);
}
function sedWriteTargets2(args) {
  const inplace = args.some(
    (arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[A-Za-z]*i/u.test(arg)
  );
  if (!inplace) return [];
  const files = [];
  let skipNext = false;
  let skippedScript = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === void 0) continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") {
      files.push(...args.slice(index + 1));
      break;
    }
    if (arg === "-e" || arg === "-f" || arg === "--expression" || arg === "--file") {
      skipNext = true;
      skippedScript = true;
      continue;
    }
    if (arg.startsWith("-") || arg === "") continue;
    if (!skippedScript && looksLikeSedScript(arg)) {
      skippedScript = true;
      continue;
    }
    files.push(arg);
  }
  return files;
}
function commandWriteTargets2(tokens) {
  const invocation = unwrapCommand2(tokens);
  if (!invocation.length) return [];
  const name = tokenBasename3(invocation[0]);
  const args = invocation.slice(1);
  if (name === "sed") return sedWriteTargets2(args);
  if (name === "cp") return copyDestTargets(args);
  if (name === "mv") return moveWriteTargets(args);
  if (name === "rm") return nonFlagOperands2(args);
  return [];
}
function extractShellWriteTargets(command) {
  const text = String(command ?? "");
  const paths = [];
  const push = (raw) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of text.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) {
    push(match[1]);
  }
  for (const tokens of splitSimpleCommands2(tokenizeShell(text))) {
    for (const path of commandWriteTargets2(tokens)) push(path);
  }
  return [...new Set(paths)];
}
function warn2(message) {
  process.stderr.write(`[source-integrity] ${message}
`);
}
function extractFileTargets2(event) {
  if (isShellTool(eventToolName(event))) {
    const cwd = eventCwd(event);
    return [...new Set(
      extractShellWriteTargets(extractShellCommand(event) ?? "").filter(Boolean).map((path) => isAbsolute4(path) ? resolve8(path) : resolve8(cwd, path.replace(/^\.\//u, "")))
    )];
  }
  if (!isFileMutationTool(eventToolName(event))) return [];
  return extractFileTargets(event);
}
function extractInsertedText(event) {
  const tool = isRecord(event.tool) ? event.tool : void 0;
  const input = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input ?? {};
  const texts = [];
  if (isShellTool(eventToolName(event))) {
    const command = extractShellCommand(event);
    if (command) texts.push(command);
  }
  const visit = (value) => {
    if (!isRecord(value)) return;
    for (const key of ["content", "new_string", "newString", "text", "cell_source", "patch", "input"]) {
      const field = value[key];
      if (typeof field === "string") texts.push(field);
    }
    if (Array.isArray(value.edits)) value.edits.forEach(visit);
  };
  if (typeof input === "string") texts.push(input);
  else visit(input);
  return texts.join("\n");
}
function resolveRepoRoot3(cwd) {
  try {
    return execFileSync3("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
}
function relativePath2(filePath, repoRoot2, cwd) {
  const base = repoRoot2 ?? cwd;
  const candidate = relative3(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}
async function loadUserConfig3(repoRoot2) {
  if (!repoRoot2) return null;
  const configPath = join8(repoRoot2, CONFIG_FILE_NAME2);
  if (!existsSync6(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL4(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warn2(`failed to load ${CONFIG_FILE_NAME2}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function preToolDeny2(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function reportOutput(eventName2, text) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName2,
      additionalContext: text
    }
  };
}
function writeOutput(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}
`);
}
function formatPreFindings(findings) {
  return [
    "[Source Sanity Guard] Unsafe source write detected",
    "",
    ...findings.map((finding) => `- ${finding.path}: ${finding.message}`),
    "",
    "blockingContract:",
    "  observedFacts: A file target or pending content matched a source hygiene check.",
    "  harm: Backup artifacts and clearly garbled text contaminate source, reviews, and later builds.",
    "  unblockWhen: Use the canonical source path and remove clearly corrupted replacement characters.",
    "  recovery: Restore the original text from an authoritative source; do not commit temporary copies or replace corruption with guessed content."
  ].join("\n");
}
async function runPre2(event, config, repoRoot2, cwd) {
  const targets = extractFileTargets2(event);
  if (targets.length === 0) return;
  const insertedText = extractInsertedText(event);
  const garbled = analyzeGarbledText(insertedText);
  const findings = [];
  let hasBlock = false;
  for (const target2 of targets) {
    const path = relativePath2(target2, repoRoot2, cwd);
    if (isBuiltInSkippedPath(path)) continue;
    const backupMode = modeFor("backupArtifact", path, config);
    if (backupMode !== "off" && isBackupArtifactPath(path)) {
      findings.push({ path, mode: backupMode, message: "backup or temporary filename inside a source directory" });
      if (backupMode === "block") hasBlock = true;
    }
    const garbledMode = modeFor("garbledText", path, config);
    if (garbled && garbledMode !== "off" && isTextPath(path)) {
      findings.push({
        path,
        mode: garbledMode,
        message: `pending text contains ${garbled.replacementCharacters} U+FFFD replacement character(s)`
      });
      if (garbledMode === "block") hasBlock = true;
    }
  }
  if (findings.length === 0) return;
  const message = formatPreFindings(findings);
  writeOutput(hasBlock ? preToolDeny2(message) : reportOutput("PreToolUse", message));
}
async function main3() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const mode = process.argv[2] ?? "pre";
  if (mode === "post") {
    await runEncodingPost(event);
    return;
  }
  const cwd = resolve8(eventCwd(event));
  const repoRoot2 = resolveRepoRoot3(cwd);
  const config = resolveConfig(await loadUserConfig3(repoRoot2));
  await runPre2(event, config, repoRoot2, cwd);
}

// plugins/workspace-integrity/src/domains/web/policy.ts
var policy11 = {
  plugin: "web-frontend-engineering",
  displayName: "Web Frontend Engineering",
  active: (context) => !packageDeclaresDependency(context, "react-native"),
  protections: [
    { id: "javascript-lockfiles", match: /(?:^|\/)(?:bun\.lockb?|deno\.lock|npm-shrinkwrap\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/iu, reason: "JavaScript lockfiles are generated by package managers.", recovery: "Change package.json and regenerate with npm, pnpm, yarn, bun, or deno." },
    { id: "javascript-dependencies", match: /(?:^|\/)node_modules(?:\/|$)/iu, reason: "node_modules is package-manager-owned.", recovery: "Change sources or declarations and reinstall dependencies." }
  ],
  validators: [
    { id: "javascriptSyntax", enforcement: "deterministic", kind: "javascript", match: /\.(?:cjs|js|mjs)$/iu, mode: "block" },
    { id: "typescriptSyntax", enforcement: "deterministic", kind: "typescript", match: /\.(?:cts|mts|ts|tsx)$/iu, mode: "block" },
    { id: "eslint", enforcement: "advisory", kind: "eslint", match: /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu, mode: "report" },
    { id: "packageJson", enforcement: "deterministic", kind: "json", match: /(?:^|\/)package\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/entries/hooks/dispatcher.ts
var domainPolicies = [policy, policy2, policy3, policy4, policy5, policy6, policy7, policy8, policy9, policy10, policy11];
var domainsPreHandler = ownerHookHandler(async () => {
  for (const policy12 of domainPolicies) await runDomainEngineeringHook(policy12, "pre");
});
var domainsPostHandler = ownerHookHandler(async () => {
  for (const policy12 of domainPolicies) await runDomainEngineeringHook(policy12, "post");
});
var domainsStopHandler = ownerHookHandler(async () => {
  for (const policy12 of domainPolicies) await runDomainEngineeringHook(policy12, "stop");
});
var qualityHandler = ({ raw }) => {
  const exitCode = runChecks(Buffer.from(raw), "post");
  if (exitCode !== 0) throw new Error(`engineering quality checks exited with status ${exitCode}`);
};
var qualityPreHandler = ({ raw }) => {
  const exitCode = runChecks(Buffer.from(raw), "pre");
  if (exitCode !== 0) return preToolDeny("The proposed write exceeds its configured file line budget. Split or reduce it before retrying.");
};
var qualityStopHandler = ({ raw }) => {
  const exitCode = runChecks(Buffer.from(raw), "stop");
  if (exitCode !== 0) return stopBlock("Unresolved post-write file line budget debt remains. Reduce or split the reported files before completion.");
};
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "commands:cmd-safety-hook-post-tool": ownerHookHandler(main),
  "commands:cmd-safety-hook-pre-tool": ownerHookHandler(main2),
  "domains:pre-tool": domainsPreHandler,
  "domains:post-tool": domainsPostHandler,
  "domains:stop": domainsStopHandler,
  "quality:engineering-quality-post": qualityHandler,
  "quality:engineering-quality-pre": qualityPreHandler,
  "quality:engineering-quality-stop": qualityStopHandler,
  "source:source-integrity": ownerHookHandler(main3)
});
