<template>
    <section class="d-flex flex-column mb-3">
        <div class="d-flex">
            <Items :prefix="ITEMS_PREFIX" @search="handleClickedItems" />

            <MonacoEditor
                ref="monacoEditor"
                class="border flex-grow-1 position-relative"
                language="filter"
                :schema-type="domain"
                :value="filter"
                @change="filter = $event"
                :theme="themeComputed"
                :options="options"
                @editor-did-mount="editorDidMount"
                suggestions-on-focus
            />
            <el-button-group
                class="d-inline-flex"
                :class="{
                    'me-1':
                        buttons.refresh.shown ||
                        buttons.settings.shown ||
                        dashboards.shown ||
                        properties.shown,
                }"
            >
                <Save
                    :disabled="filter.length === 0"
                    :prefix="ITEMS_PREFIX"
                    :current="filter"
                />
            </el-button-group>

            <el-button-group
                v-if="buttons.refresh.shown || buttons.settings.shown"
                class="d-inline-flex ms-1"
                :class="{'me-1': dashboards.shown || properties.shown}"
            >
                <RefreshButton
                    v-if="buttons.refresh.shown"
                    @refresh="buttons.refresh.callback"
                />
                <Settings
                    v-if="buttons.settings.shown"
                    :settings="buttons.settings"
                    :refresh="buttons.refresh.shown"
                />
            </el-button-group>

            <Dashboards
                v-if="dashboards.shown"
                @dashboard="(value) => emits('dashboard', value)"
                class="ms-1"
            />
            <Properties
                v-if="properties.shown"
                :columns="properties.columns"
                :model-value="properties.displayColumns"
                :storage-key="properties.storageKey"
                @update-properties="(v: Property['displayColumns']) => emits('updateProperties', v)"
                class="ms-1"
            />
        </div>
    </section>
</template>

<script setup lang="ts">
    import MonacoEditor, {ThemeBase} from "../inputs/MonacoEditor.vue"
    import {computed, ref, watch} from "vue";
    import Utils from "../../utils/utils";
    import {Buttons, Property, Shown} from "./utils/types";
    import {editor} from "monaco-editor/esm/vs/editor/editor.api";
    import Items from "./segments/Items.vue";
    import {cssVariable} from "@kestra-io/ui-libs";
    import {useRoute, useRouter} from "vue-router";
    import Save from "./segments/Save.vue";
    import Settings from "./segments/Settings.vue";
    import RefreshButton from "../layout/RefreshButton.vue";
    import Dashboards from "./segments/Dashboards.vue";
    import Properties from "./segments/Properties.vue";
    import {COMPARATOR_CHARS} from "../../composables/monaco/languages/filters/filterLanguageConfigurator.ts";
    import {Comparators} from "../../composables/monaco/languages/filters/filterCompletion.ts";

    const router = useRouter();

    withDefaults(defineProps<{
        domain: string,
        propertiesWidth?: number,
        buttons?: Buttons,
        dashboards?: Shown,
        properties?: Property,
    }>(), {
        propertiesWidth: 144,
        buttons: () => ({
            refresh: {
                shown: false,
                callback: () => {
                }
            },
            settings: {
                shown: false,
                charts: {
                    shown: false,
                    value: false,
                    callback: () => {
                    },
                },
            },
        }),
        dashboards: () => ({
            shown: false,
        }),
        properties: () => ({
            shown: false,
        })
    });

    const emits = defineEmits(["dashboard", "updateProperties"]);

    const filter = ref<string>("");

    const ITEMS_PREFIX = useRoute().name!.toString();
    const handleClickedItems = (value: string | undefined) => {
        if (value) {
            filter.value = value;
        }
    };

    const themeComputed: Omit<Partial<editor.IStandaloneThemeData>, "base"> & { base: ThemeBase } = {
        base: Utils.getTheme()!,
        colors: {
            "editor.background": cssVariable("--ks-background-input")!
        },
        rules: [
            {token: "variable.value", foreground: cssVariable("--ks-badge-content")},
        ],
    };
    const options: editor.IStandaloneEditorConstructionOptions = {
        lineNumbers: "off",
        folding: false,
        renderLineHighlight: "none",
        wordBasedSuggestions: "off",
        occurrencesHighlight: "off",
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        lineNumbersMinChars: 0,
        lineHeight: 32,
        fontSize: 16,
        minimap: {
            enabled: false,
        },
        scrollBeyondLastLine: false,
        scrollBeyondLastColumn: 0,
        scrollbar: {
            horizontal: "hidden",
            alwaysConsumeMouseWheel: false,
            handleMouseWheel: true,
            horizontalScrollbarSize: 0,
            verticalScrollbarSize: 0,
            useShadows: false,
        },
        stickyScroll: {
            enabled: false,
        },
        find: {
            addExtraSpaceOnTop: false,
            autoFindInSelection: "never",
            seedSearchStringFromSelection: "never",
        },
        contextmenu: false,
        lineDecorationsWidth: 0,
        automaticLayout: true,
        wordWrap: "on",
        fontFamily: "var(--bs-body-font-family)",
        wrappingStrategy: "advanced"
    };

    const monacoEditor = ref<typeof MonacoEditor>();

    const editorDidMount = (mountedEditor: editor.IStandaloneCodeEditor) => {
        mountedEditor.onDidContentSizeChange((e) => {
            if (monacoEditor.value === undefined) {
                return;
            }
            monacoEditor.value.$el.style.height =
                e.contentHeight + "px";
        });

        mountedEditor.onDidChangeModelContent(e => {
            if (e.changes.length === 1 && e.changes[0].text === " ") {
                if (mountedEditor.getModel()?.getValue().charAt(e.changes[0].rangeOffset - 1) === ",") {
                    mountedEditor.executeEdits("", [
                        {
                            range: {
                                ...e.changes[0].range,
                                startColumn: e.changes[0].range.startColumn - 1,
                                endColumn: e.changes[0].range.startColumn,
                            },
                            text: "",
                            forceMoveMarkers: true
                        }
                    ]);
                }
            }
        })
    }

    const COMPARATOR_LABEL_BY_VALUE = Object.fromEntries(
        Object.entries(Comparators)
            .map(([label, value]) => [value, label])
    );
    const filterQueryString = computed(() => {
        const JOINED_COMPARATOR_CHARS = COMPARATOR_CHARS.join("");
        const KEY_MATCHER = "([^ " + JOINED_COMPARATOR_CHARS + "]+)";
        const COMPARATOR_MATCHER = "([" + JOINED_COMPARATOR_CHARS + "]+)";
        const VALUE_MATCHER = "((?:(?:(?<=[^ " + JOINED_COMPARATOR_CHARS + "]),)?(?:(?:\"[^," + JOINED_COMPARATOR_CHARS + "]+\")|(?:[^ ," + JOINED_COMPARATOR_CHARS + "]+)))+)";
        const filterMatcher = new RegExp(" *" + KEY_MATCHER + COMPARATOR_MATCHER + VALUE_MATCHER + " *", "g");
        let matches: RegExpExecArray | null;
        const filters: Record<string, Record<string, string[]>> = {};
        while ((matches = filterMatcher.exec(filter.value)) !== null) {
            const key = matches[1];
            const comparator = matches[2];
            const values = matches[3].split(",").filter(value => value !== "").map(value => value.replaceAll("\"", ""));

            if (filters[key] === undefined) {
                filters[key] = {};
            }

            let comparatorLabel: string = COMPARATOR_LABEL_BY_VALUE[comparator];
            if (values.length > 1) {
                switch (comparator) {
                case "=": {
                    comparatorLabel = "IN";
                    break;
                }
                case "!=": {
                    comparatorLabel = "NOT_IN";
                    break;
                }
                }
            }

            if (filters[key][comparatorLabel] === undefined) {
                filters[key][comparatorLabel] = [];
            }

            values.forEach(value => {
                if (!filters[key][comparatorLabel].includes(value)) {
                    filters[key][comparatorLabel].push(value);
                }
            });
        }

        return Object.fromEntries(
            Object.entries(filters).flatMap(([key, comparatorAndValues]) => {
                return Object.entries(comparatorAndValues).map(([comparator, values]) => {
                    return ["filters[" + key + "][" + comparator + "]", values.join(",")];
                });
            })
        );
    })

    watch(filterQueryString, () => {
        router.push({
            query: filterQueryString.value
        });
    })
</script>

<style lang="scss" scoped>
    @use "@kestra-io/ui-libs/src/scss/variables.scss" as global-var;

    :deep(.ks-monaco-editor) {
        padding-left: 0.75rem;
        padding-right: 0.75rem;
        background-color: var(--ks-background-input);
        border-top-right-radius: var(--el-border-radius-base);
        border-bottom-right-radius: var(--el-border-radius-base);
        min-width: 0;

        .mtk25 {
            background-color: var(--ks-badge-background);
            border-radius: var(--el-border-radius-base);
            padding: 2px 6px;
        }

        .monaco-editor .suggest-widget .monaco-list .monaco-list-row {
            .suggest-icon, .kestra-icon-wrapper > .material-design-icon {
                display: inline-flex;
                vertical-align: middle;
                font-size: 18px;
            }

            @each $status in global-var.$statusList {
                &[aria-label="#{to-upper-case($status)}"]:not(.focused) {
                    background-color: var(--ks-background-#{$status});
                    border: 1px solid var(--ks-border-#{$status});
                    border-radius: var(--el-border-radius-base);

                    .suggest-icon, .kestra-icon-wrapper, .monaco-highlighted-label {
                        color: var(--ks-content-#{$status});
                    }
                }
            }
        }
    }
</style>