import {Comparators, Completion, FilterKeyCompletions, PICK_DATE_VALUE} from "./filterCompletion";
import {FilterLanguage} from "./filterLanguage";
import permission from "../../../../models/permission";
import action from "../../../../models/action";
import {Me} from "../../../../stores/auth";

const executionFilterKeys: Record<string, FilterKeyCompletions> = {
    namespace: new FilterKeyCompletions(
        [Comparators.EQUALS, Comparators.NOT_EQUALS, Comparators.CONTAINS, Comparators.STARTS_WITH, Comparators.ENDS_WITH, Comparators.REGEX],
        async (store) => {
            const user = store.getters["auth/user"] as Me;
            if (user && user.hasAnyActionOnAnyNamespace(permission.NAMESPACE, action.READ)) {
                return [...new Set(((await store.dispatch("namespace/loadNamespacesForDatatype", {dataType: "flow"})) as string[])
                    .flatMap(namespace => {
                        return namespace.split(".").reduce((current: string[], part: string) => {
                            const previousCombination = current?.[current.length - 1];
                            return [...current, `${(previousCombination ? previousCombination + "." : "")}${part}`];
                        }, [])
                    }))].map(namespace => new Completion(namespace, namespace));
            }

            return [];
        },
        true
    ),
    flowId: new FilterKeyCompletions(
        [Comparators.EQUALS, Comparators.NOT_EQUALS, Comparators.CONTAINS],
        undefined,
        true
    ),
    state: new FilterKeyCompletions(
        [Comparators.EQUALS, Comparators.NOT_EQUALS],
        (_, hardcodedValues) => Promise.resolve(hardcodedValues.EXECUTION_STATES),
        true
    ),
    scope: new FilterKeyCompletions(
        [Comparators.EQUALS, Comparators.NOT_EQUALS],
        (_, hardcodedValues) => Promise.resolve(hardcodedValues.SCOPES),
        true
    ),
    child: new FilterKeyCompletions(
        [Comparators.EQUALS, Comparators.NOT_EQUALS],
        (_, hardcodedValues) => Promise.resolve(hardcodedValues.CHILDS),
        true
    ),
    timeRange: new FilterKeyCompletions(
        [Comparators.EQUALS],
        (_, hardcodedValues) => Promise.resolve(hardcodedValues.RELATIVE_DATE)
    ),
    startDate: new FilterKeyCompletions(
        [Comparators.GREATER_THAN, Comparators.LESS_THAN, Comparators.EQUALS, Comparators.NOT_EQUALS],
        () => Promise.resolve(PICK_DATE_VALUE)
    ),
    endDate: new FilterKeyCompletions(
        [Comparators.LESS_THAN, Comparators.GREATER_THAN, Comparators.EQUALS, Comparators.NOT_EQUALS],
        () => Promise.resolve(PICK_DATE_VALUE)
    ),
    labels: new FilterKeyCompletions(
        [Comparators.EQUALS, Comparators.NOT_EQUALS],
        undefined,
        true
    ),
    triggerExecutionId: new FilterKeyCompletions(
        [Comparators.EQUALS, Comparators.NOT_EQUALS, Comparators.CONTAINS, Comparators.STARTS_WITH, Comparators.ENDS_WITH],
        undefined,
        true
    )
}

export default class ExecutionFilterLanguage extends FilterLanguage {
    constructor() {
        super("executions", executionFilterKeys);
    }
}