import {Comparators, Completion, FilterKeyCompletions, ValueCompletions} from "./filterCompletion.ts";
import {useValues} from "../../../../components/filter/composables/useValues.ts";
import {Store} from "vuex";

export abstract class FilterLanguage {
    private readonly _domain: string;
    private readonly _filterKeyCompletions: Record<string, FilterKeyCompletions>;

    get domain(): string {
        return this._domain;
    }

    protected constructor(domain: string, filterKeyCompletions: Record<string, FilterKeyCompletions>) {
        this._domain = domain;
        this._filterKeyCompletions = filterKeyCompletions;
    }

    async keyCompletion(): Promise<Completion[]> {
        return Promise.resolve(
            Object.entries(this._filterKeyCompletions)
                .map(([key, {comparators}]) => {
                    return new Completion(key, key + comparators[0])
                })
        );
    }

    async comparatorCompletion(key: string): Promise<Completion[]> {
        const filterKey = this._filterKeyCompletions[key];
        if (filterKey === undefined) {
            return Promise.resolve([]);
        }

        const comparatorValueByLabel = Object.entries(Comparators);
        return Promise.resolve(
            Object.entries(filterKey.comparators)
                .map(([_, value]) => new Completion(comparatorValueByLabel.find(([_, compValue]) => compValue === value)![0], value))
        );
    }

    async valueCompletion(store: Store<Record<string, any>>, hardcodedValues: ReturnType<typeof useValues>["VALUES"], key: string): Promise<ValueCompletions> {
        const filterKey = this._filterKeyCompletions[key];
        if (filterKey === undefined) {
            return Promise.resolve([]);
        }

        return (await filterKey.valuesFetcher(store, hardcodedValues)) as unknown as ValueCompletions;
    }

    multipleValuesAllowed(key: string): boolean {
        return this._filterKeyCompletions?.[key]?.allowMultipleValues ?? false;
    }
}