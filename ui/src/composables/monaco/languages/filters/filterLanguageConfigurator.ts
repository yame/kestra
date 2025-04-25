import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import {editor, IPosition} from "monaco-editor/esm/vs/editor/editor.api";
import ExecutionFilterLanguage from "./executionFilterLanguage";
import AbstractLanguageConfigurator from "../abstractLanguageConfigurator";
import {Store} from "vuex";
import {useI18n} from "vue-i18n";
import {FilterLanguage} from "./filterLanguage";
import {useValues} from "../../../../components/filter/composables/useValues";
import {Comparators, Completion, PICK_DATE_VALUE} from "./filterCompletion.ts";
import IWordAtPosition = editor.IWordAtPosition;

const filterLanguages: FilterLanguage[] = [
    new ExecutionFilterLanguage()
];

const filterLanguageId = "filter";
export const COMPARATOR_CHARS = [...new Set(Object.values(Comparators).flatMap(c => c.split("")))];

export default class FilterLanguageConfigurator extends AbstractLanguageConfigurator {
    private readonly _filterLanguage: FilterLanguage | undefined;
    private readonly _domain: string;

    constructor(domain: string) {
        super(filterLanguageId);

        this._domain = domain;
        this._filterLanguage = filterLanguages.find(filterLanguage => filterLanguage.domain === domain);
    }

    async configureLanguage(_: Store<Record<string, any>>): Promise<void> {
        if (this._filterLanguage && monaco.languages.getLanguages().find(l => l.id === filterLanguageId) === undefined) {
            monaco.languages.register({id: filterLanguageId});
            monaco.languages.setMonarchTokensProvider(filterLanguageId, {
                operators: Object.values(Comparators),
                symbols: new RegExp("[" + COMPARATOR_CHARS.join("") + "]+"),
                keys: (await this._filterLanguage.keyCompletion()).map(({label}) => label),
                includeLF: true,
                tokenizer: {
                    root: [
                        [/\w+/, {
                            cases: {
                                "@keys": {token: "variable.name", next: "@comparator"},
                                "@default": "invalid",
                            },
                        }],
                    ],
                    comparator: [
                        [/@symbols/, {
                            cases: {
                                "@operators": {token: "operators", next: "@value"},
                            },
                        }],
                    ],
                    value: [
                        [/"[^"]+(?![^"]*")/, "invalid"],
                        [/"[^,"]*"/, {token: "variable.value", next: "@separator"}],
                        [/[^\s,"]*/, {token: "variable.value", next: "@separator"}],
                    ],
                    separator: [
                        [/\s+/, {token: "space", next: "@popall"}],
                        [",", {token: "comma", next: "@value"}],
                    ],
                }
            })
        }
    }

    configureAutoCompletion(t: ReturnType<typeof useI18n>["t"], store: Store<Record<string, any>>, __: editor.ICodeEditor | undefined) {
        const filterLanguage = this._filterLanguage;
        if (filterLanguage === undefined) {
            return [];
        }

        const {VALUES: hardcodedValues} = useValues(this._domain, t);
        const SEPARATOR_CHARS = [" ", "\n"];
        const TO_SUGGESTIONS = (position: IPosition, wordAtPosition: IWordAtPosition, completions: Completion[]) => (
            {
                suggestions: completions.map(({label, value}, index) => {
                    return ({
                        kind: monaco.languages.CompletionItemKind.Property,
                        label: label,
                        insertText: value,
                        sortText: "1a".repeat(index + 1),
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: wordAtPosition?.startColumn ?? position.column,
                            endColumn: wordAtPosition?.endColumn ?? position.column
                        },
                        command: {
                            id: "editor.action.triggerSuggest",
                            title: "Suggest"
                        }
                    });
                })
            }
        );
        const KEY_COMPLETIONS: Promise<Completion[]> = filterLanguage.keyCompletion();
        const POSSIBLE_KEYS: Promise<string[]> = KEY_COMPLETIONS.then(c => c.map(k => k.label));
        return [
            monaco.languages.registerCompletionItemProvider({
                language: filterLanguageId, pattern: {
                    base: "/",
                    pattern: this._domain + "-*." + filterLanguageId
                }
            }, {
                triggerCharacters: [" ", ","],
                async provideCompletionItems(model, position) {
                    const wordAfterPosition = model.findNextMatch(
                        "([^,\\s" + COMPARATOR_CHARS.join("") + "]*)",
                        position,
                        true,
                        false,
                        null,
                        true
                    );
                    const wordAtPositionMatch = model.findPreviousMatch(
                        "([^,\\s" + COMPARATOR_CHARS.join("") + "]*)$",
                        position.with(undefined, wordAfterPosition?.range.endColumn),
                        true,
                        false,
                        null,
                        true
                    );

                    const wordAtPosition = {
                        word: wordAtPositionMatch?.matches?.[1] ?? "",
                        startColumn: wordAtPositionMatch?.range?.startColumn ?? position.column,
                        endColumn: wordAtPositionMatch?.range?.endColumn ?? position.column
                    };

                    console.log(wordAtPosition.word);

                    const modelValue = model.getValue();
                    const offset = model.getOffsetAt(position);
                    const previousChar = modelValue.charAt(offset - 1);

                    if (offset === 0 || SEPARATOR_CHARS.includes(previousChar)) {
                        return TO_SUGGESTIONS(position, wordAtPosition, await KEY_COMPLETIONS);
                    }

                    if ((await POSSIBLE_KEYS).includes(wordAtPosition.word) && position.column === wordAtPosition.endColumn) {
                        return TO_SUGGESTIONS(
                            position,
                            {word: "", startColumn: wordAtPosition.endColumn, endColumn: wordAtPosition.endColumn},
                            await filterLanguage.comparatorCompletion(wordAtPosition.word)
                        );
                    }

                    const previousColumn = wordAtPosition.startColumn - 1;
                    const beforeWordPosition = previousColumn > 0
                        ? position.with(undefined, previousColumn)
                        : undefined;
                    const charBeforeCurrentWord = beforeWordPosition === undefined ? "" : modelValue.charAt(model.getOffsetAt(beforeWordPosition));
                    if (
                        COMPARATOR_CHARS.includes(previousChar)
                        || (
                            charBeforeCurrentWord !== undefined && (
                                COMPARATOR_CHARS.includes(charBeforeCurrentWord)
                                || charBeforeCurrentWord === ","
                            )
                        )
                    ) {
                        const currentFilterMatch = model.findPreviousMatch(
                            "([^\\s" + COMPARATOR_CHARS.join("") + "]+)([" + COMPARATOR_CHARS.join("") + "]+)([^\\s" + COMPARATOR_CHARS.join("") + "]*)$",
                            beforeWordPosition ?? position.with(undefined, wordAtPosition.startColumn),
                            true,
                            false,
                            null,
                            true
                        );

                        if (currentFilterMatch !== null) {
                            const [, key, comparator, commaSeparatedValues] = currentFilterMatch?.matches ?? [];

                            if (key !== undefined) {
                                const valueCompletions = await filterLanguage.valueCompletion(
                                    store,
                                    hardcodedValues,
                                    key
                                );
                                if (Array.isArray(valueCompletions)) {
                                    const filledValues = commaSeparatedValues === undefined ? [] : commaSeparatedValues.split(",");
                                    const remainingCompletions = valueCompletions
                                        .filter(completion => !filledValues.includes(completion.value) && !filledValues.includes("\"" + completion.value + "\""));
                                    const completions = remainingCompletions
                                        .map(({label, value}) => new Completion(
                                            label,
                                            value +
                                            (
                                                ([Comparators.EQUALS, Comparators.NOT_EQUALS] as string[]).includes(comparator)
                                                && remainingCompletions.length > 1
                                                && filterLanguage.multipleValuesAllowed(key)
                                                    ? ","
                                                    : " "
                                            ))
                                        );
                                    return TO_SUGGESTIONS(position, wordAtPosition, completions);
                                } else if (valueCompletions === PICK_DATE_VALUE) {
                                    return TO_SUGGESTIONS(position, wordAtPosition, [new Completion("_DATE_PICKER_", "_DATE_PICKER_")]);
                                }
                            }
                        }
                    } else {
                        return TO_SUGGESTIONS(position, wordAtPosition, await KEY_COMPLETIONS);
                    }

                    return TO_SUGGESTIONS(position, wordAtPosition, await KEY_COMPLETIONS);
                }
            })
        ]
    }
}