/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BaseTokens,
  createParser,
  ParserOptions,
  ParserUnexpectedOptions,
  SimpleToken,
  ValueToken,
  TokenValues,
  isDigit,
  isESIdentifierStart,
  isESIdentifierChar,
  ComplexToken,
  Position,
} from '@romejs/parser-core';
import {
  AnyRegExpBodyItem,
  RegExpGroupCapture,
  RegExpCharSet,
  RegExpCharSetRange,
  RegExpQuantified,
  RegExpGroupNonCapture,
  AnyRegExpEscapedCharacter,
  RegExpSubExpression,
  RegExpAlternation,
  AnyRegExpExpression,
} from '@romejs/js-ast';
import {PartialDiagnostics} from '@romejs/diagnostics';
import {Number0, get0, add} from '@romejs/ob1';

type Tokens = BaseTokens & {
  '^': SimpleToken<'^'>;
  $: SimpleToken<'$'>;
  '.': SimpleToken<'.'>;
  '[': SimpleToken<'['>;
  ']': SimpleToken<']'>;
  '(': SimpleToken<'('>;
  ')': SimpleToken<')'>;
  '?': SimpleToken<'?'>;
  '{': SimpleToken<'{'>;
  '}': SimpleToken<'}'>;
  '+': SimpleToken<'+'>;
  '*': SimpleToken<'*'>;
  '|': SimpleToken<'|'>;
  Character: ComplexToken<
    'Character',
    {
      value: string;
      escaped: boolean;
    }
  >;
  EscapedCharacter: ValueToken<
    'EscapedCharacter',
    'd' | 'D' | 'b' | 'B' | 's' | 'S' | 'w' | 'W'
  >;
};

type GroupModifiers =
  | undefined
  | {
      type: 'NON_CAPTURE';
      kind: RegExpGroupNonCapture['kind'];
    }
  | {
      type: 'NAMED_CAPTURE';
      name: string;
    };

type RegExpParserOptions = ParserOptions & {
  unicode: boolean;
};

function getCodePoint(char: string): number {
  if (char.length === 1) {
    const point = char.codePointAt(0);
    if (point !== undefined) {
      return point;
    }
  }

  throw new Error('Input was not 1 character long');
}

export const createRegExpParser = createParser(
  ParserCore =>
    class RegExpParser extends ParserCore<Tokens, void> {
      constructor(opts: RegExpParserOptions) {
        super(opts, '@romejs/codec-js-regexp');
        this.diagnostics = [];
        this.unicode = opts.unicode;
      }

      diagnostics: PartialDiagnostics;
      unicode: boolean;

      addDiagnostic(opts: ParserUnexpectedOptions) {
        this.diagnostics.push(this.createDiagnostic(opts));
      }

      unexpected() {
        throw new Error('No throwing');
      }

      tokenize(index: Number0, input: string): TokenValues<Tokens> {
        const char = input[get0(index)];

        if (char === '\\') {
          const end = add(index, 2);

          const nextChar = input[get0(index) + 1];
          switch (nextChar) {
            case 't':
              return this.finishComplexToken(
                'Character',
                {escaped: false, value: '\t'},
                end,
              );

            case 'n':
              return this.finishComplexToken(
                'Character',
                {escaped: false, value: '\n'},
                end,
              );

            case 'r':
              return this.finishComplexToken(
                'Character',
                {escaped: false, value: '\r'},
                end,
              );

            case 'v':
              return this.finishComplexToken(
                'Character',
                {escaped: false, value: '\v'},
                end,
              );

            case 'f':
              return this.finishComplexToken(
                'Character',
                {escaped: false, value: '\f'},
                end,
              );

            case 'b':
              return this.finishComplexToken(
                'Character',
                {escaped: false, value: '\b'},
                end,
              );

            case 'd':
            case 'D':
            case 'b':
            case 'B':
            case 's':
            case 'S':
            case 'w':
            case 'W':
              return this.finishValueToken('EscapedCharacter', nextChar, end);

            case 'k':
              if (this.unicode) {
                // TODO named group back reference https://github.com/tc39/proposal-regexp-named-groups#backreferences
              }

            case 'p':
              if (this.unicode) {
                // TODO unicode property escapes https://github.com/tc39/proposal-regexp-unicode-property-escapes
              }

            case 'p':
              if (this.unicode) {
                // TODO unicode property escapes https://github.com/tc39/proposal-regexp-unicode-property-escapes
              }

            case 'c':
            // TODO???

            case '0':
            // TODO null and octal

            case 'x':
            // TODO hex

            case 'u':
            // TODO unicode

            // Redundant escaping
            default:
              // TODO dangling backslash
              // TODO backreference
              return this.finishComplexToken(
                'Character',
                {value: nextChar, escaped: true},
                end,
              );
          }
        }

        switch (char) {
          case '$':
            return this.finishToken('$');

          case '^':
            return this.finishToken('^');

          case '.':
            return this.finishToken('.');

          case '?':
            return this.finishToken('?');

          case '{':
            return this.finishToken('{');

          case '}':
            return this.finishToken('}');

          case '+':
            return this.finishToken('+');

          case '|':
            return this.finishToken('|');

          case '*':
            return this.finishToken('*');

          case '[':
            return this.finishToken('[');

          case ']':
            return this.finishToken(']');

          case '(':
            return this.finishToken('(');

          case ')':
            return this.finishToken(')');
        }

        return this.finishComplexToken('Character', {
          value: char,
          escaped: false,
        });
      }

      getGroupModifiers(): GroupModifiers {
        const token = this.getToken();

        if (token.type === 'Character') {
          switch (token.value) {
            case ':':
              return {
                type: 'NON_CAPTURE',
                kind: undefined,
              };

            case '=':
              return {
                type: 'NON_CAPTURE',
                kind: 'positive-lookahead',
              };

            case '!':
              return {
                type: 'NON_CAPTURE',
                kind: 'negative-lookahead',
              };

            case '<':
              const nextToken = this.lookaheadToken();

              if (nextToken.type === 'Character') {
                switch (nextToken.value) {
                  case '!':
                    this.nextToken();
                    return {
                      type: 'NON_CAPTURE',
                      kind: 'negative-lookbehind',
                    };

                  case '=':
                    this.nextToken();
                    return {
                      type: 'NON_CAPTURE',
                      kind: 'positive-lookbehind',
                    };
                }

                if (isESIdentifierStart(nextToken.value)) {
                  let name = '';

                  let skipCount = 1;
                  let targetToken: TokenValues<Tokens> = nextToken;
                  while (
                    targetToken.type === 'Character' &&
                    isESIdentifierChar(targetToken.value)
                  ) {
                    name += targetToken.value;
                    targetToken = this.lookaheadToken(targetToken.end);
                    skipCount++;
                  }

                  if (
                    targetToken.type === 'Character' &&
                    targetToken.value === '>'
                  ) {
                    // Skip through all the name tokens
                    // This is kinda a hacky solution, and slower than it could be
                    for (let i = 0; i < skipCount; i++) {
                      this.nextToken();
                    }

                    return {
                      type: 'NAMED_CAPTURE',
                      name,
                    };
                  }
                }
              }
          }
        }

        this.addDiagnostic({
          message: 'Invalid capture group modifier',
          token,
        });
      }

      parseGroupCapture(): RegExpGroupCapture | RegExpGroupNonCapture {
        const start = this.getPosition();
        this.nextToken();

        let modifiers: GroupModifiers;
        if (this.eatToken('?')) {
          modifiers = this.getGroupModifiers();
        }

        const expression = this.parseExpression(() => !this.matchToken(')'));

        if (!this.eatToken(')')) {
          this.addDiagnostic({
            message: 'Unclosed group',
            start,
          });
        }

        if (modifiers !== undefined && modifiers.type === 'NON_CAPTURE') {
          return {
            type: 'RegExpGroupNonCapture',
            expression,
            kind: modifiers.kind,
            loc: this.finishLoc(start),
          };
        } else {
          let name = modifiers !== undefined ? modifiers.name : undefined;
          return {
            type: 'RegExpGroupCapture',
            expression,
            name,
            loc: this.finishLoc(start),
          };
        }
      }

      parseCharSet(): RegExpCharSet {
        const start = this.getPosition();
        this.nextToken();

        const body: RegExpCharSet['body'] = [];
        const invert = this.eatToken('^') !== undefined;

        while (!this.isEOF() && !this.matchToken(']')) {
          const part = this.parseCharacterOrRange();
          body.push(part);
        }

        if (!this.eatToken(']')) {
          this.addDiagnostic({
            message: 'Unclosed character set',
            start,
          });
        }

        return {
          type: 'RegExpCharSet',
          invert,
          body,
          loc: this.finishLoc(start),
        };
      }

      getCharacterFromToken(token: TokenValues<Tokens>): string {
        switch (token.type) {
          case 'Character':
            return token.value;

          case '$':
          case '^':
          case '.':
          case '?':
          case '{':
          case '}':
          case '+':
          case '*':
          case '[':
          case ']':
          case '(':
          case ')':
          case '|':
            return token.type;

          case 'SOF':
          case 'EOF':
          case 'Invalid':
            throw new Error('Unnecessary');

          default:
            throw new Error('Never');
        }
      }

      parseCharacter(): AnyRegExpEscapedCharacter {
        const token = this.getToken();

        if (token.type === 'Character') {
          this.nextToken();
          return {
            type: 'RegExpCharacter',
            value: token.value,
            loc: this.finishLocFromToken(token),
          };
        }

        if (token.type === 'EscapedCharacter') {
          this.nextToken();

          const loc = this.finishLocFromToken(token);
          switch (token.value) {
            case 'd':
              return {
                type: 'RegExpDigitCharacter',
                loc,
              };

            case 'D':
              return {
                type: 'RegExpNonDigitCharacter',
                loc,
              };

            case 'b':
              return {
                type: 'RegExpWordBoundaryCharacter',
                loc,
              };

            case 'B':
              return {
                type: 'RegExpNonWordBoundaryCharacter',
                loc,
              };

            case 's':
              return {
                type: 'RegExpWhiteSpaceCharacter',
                loc,
              };

            case 'S':
              return {
                type: 'RegExpNonWhiteSpaceCharacter',
                loc,
              };

            case 'w':
              return {
                type: 'RegExpWordCharacter',
                loc,
              };

            case 'W':
              return {
                type: 'RegExpNonWordCharacter',
                loc,
              };
          }
        }

        this.nextToken();
        return {
          type: 'RegExpCharacter',
          value: this.getCharacterFromToken(token),
          loc: this.finishLocFromToken(token),
        };
      }

      parseCharacterOrRange(): AnyRegExpEscapedCharacter | RegExpCharSetRange {
        const startPos = this.getPosition();
        let start = this.parseCharacter();

        // Range
        const nextToken = this.getToken();
        if (
          nextToken.type === 'Character' &&
          nextToken.value === '-' &&
          !nextToken.escaped
        ) {
          const lookaheadToken = this.lookaheadToken();
          if (lookaheadToken.type !== '[' && lookaheadToken.type !== 'EOF') {
            // Skip dash
            this.nextToken();

            let end = this.parseCharacter();

            const loc = this.finishLoc(startPos);

            if (
              start.type === 'RegExpCharacter' &&
              end.type === 'RegExpCharacter' &&
              getCodePoint(end.value) < getCodePoint(start.value)
            ) {
              this.addDiagnostic({
                message:
                  'Range values reversed. Start char code is greater than end char code',
                loc,
              });
              const _end = end;
              end = start;
              start = _end;
            }

            return {
              type: 'RegExpCharSetRange',
              loc,
              start,
              end,
            };
          }
        }

        return start;
      }

      parseDigits(): undefined | number {
        let digits = '';
        let token = this.getToken();
        while (token.type === 'Character' && isDigit(token.value)) {
          digits += token.value;
          token = this.nextToken();
        }

        if (digits.length === 0) {
          return undefined;
        } else {
          return Number(digits);
        }
      }

      parseQuantifier(): undefined | {min: number; max?: number} {
        if (this.eatToken('?')) {
          return {
            min: 0,
            max: 1,
          };
        }

        if (this.eatToken('*')) {
          return {
            min: 0,
            max: undefined,
          };
        }

        if (this.eatToken('+')) {
          return {
            min: 1,
            max: undefined,
          };
        }

        if (this.matchToken('{')) {
          const snapshot = this.save();

          this.nextToken();

          const min = this.parseDigits();

          if (min !== undefined) {
            const nextToken = this.getToken();
            if (nextToken.type === 'Character' && nextToken.value === ',') {
              this.nextToken();
              const max = this.parseDigits();

              const endToken = this.getToken();
              if (endToken.type === '}') {
                return {
                  min,
                  max,
                };
              }
            } else if (nextToken.type === '}') {
              return {
                min,
                max: min,
              };
            }
          }

          this.restore(snapshot);
        }
      }

      parseBodyItem(): undefined | AnyRegExpBodyItem {
        const start = this.getPosition();

        const prefix = this.parseBodyItemPrefix();
        if (prefix === undefined) {
          return undefined;
        }

        let target = prefix;

        while (true) {
          const quantifier = this.parseQuantifier();
          if (quantifier === undefined) {
            break;
          }

          const lazy = this.didEatToken('?');

          const quantified: RegExpQuantified = {
            type: 'RegExpQuantified',
            loc: this.finishLoc(start),
            item: target,
            lazy,
            ...quantifier,
          };

          target = quantified;
        }

        return target;
      }

      parseBodyItemPrefix(): undefined | AnyRegExpBodyItem {
        const token = this.getToken();

        switch (token.type) {
          case '$':
            this.nextToken();
            return {
              type: 'RegExpEndCharacter',
              loc: this.finishLocFromToken(token),
            };

          case '^':
            this.nextToken();
            return {
              type: 'RegExpStartCharacter',
              loc: this.finishLocFromToken(token),
            };

          case '.':
            this.nextToken();
            return {
              type: 'RegExpAnyCharacter',
              loc: this.finishLocFromToken(token),
            };

          case '[':
            return this.parseCharSet();

          case '(':
            return this.parseGroupCapture();

          case ')':
            this.nextToken();
            this.addDiagnostic({
              message: 'Unopened group',
              token,
            });
            return;

          case '?':
          case '*':
          case '+':
            this.nextToken();
            this.addDiagnostic({
              message: 'Invalid target for quantifier',
              token,
            });
            return;

          case ']':
          case '}':
          case 'EscapedCharacter':
          case 'Character':
            return this.parseCharacter();
        }

        this.addDiagnostic({
          message: 'Unknown regex part ' + token.type,
          token,
        });
      }

      parseExpression(
        whileCallback?: () => boolean,
      ): RegExpSubExpression | RegExpAlternation {
        const alternations: Array<{
          start: Position;
          end: Position;
          body: Array<AnyRegExpBodyItem>;
        }> = [];
        let body: Array<AnyRegExpBodyItem> = [];

        const start = this.getPosition();
        let alternateStart = start;

        while (
          !this.isEOF() &&
          (whileCallback === undefined || whileCallback())
        ) {
          if (this.eatToken('|')) {
            alternations.push({
              start: alternateStart,
              end: this.getPosition(),
              body,
            });
            alternateStart = this.getPosition();
            body = [];
            continue;
          }

          const part = this.parseBodyItem();
          if (part !== undefined) {
            body.push(part);
          }
        }

        alternations.push({
          body,
          start: alternateStart,
          end: this.getPosition(),
        });

        let expression: undefined | RegExpSubExpression | RegExpAlternation;

        while (alternations.length > 0) {
          const alternation = alternations.shift();
          if (alternation === undefined) {
            throw new Error('Impossible. We check it above.');
          }

          const sub: RegExpSubExpression = {
            type: 'RegExpSubExpression',
            body: alternation.body,
            loc: this.finishLocAt(alternation.start, alternation.end),
          };

          if (expression === undefined) {
            expression = sub;
          } else {
            const alternationNode: RegExpAlternation = {
              type: 'RegExpAlternation',
              left: expression,
              right: sub,
              loc: this.finishLocAt(
                this.getLoc(expression).start,
                alternation.end,
              ),
            };

            expression = alternationNode;
          }
        }

        if (expression === undefined) {
          throw new Error(
            'Impossible. We should always have at least one alternation that will set this.',
          );
        }

        return expression;
      }

      parse(): {
        expression: AnyRegExpExpression;
        diagnostics: PartialDiagnostics;
      } {
        return {
          expression: this.parseExpression(),
          diagnostics: this.diagnostics,
        };
      }
    },
);
