/** Form controls shared by the Settings panes. All read tokens, no literals. */
import { For, Show, type JSX } from "solid-js";

export function Field(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <label class="sp-field">
      <span class="sp-field__label">{props.label}</span>
      <span class="sp-field__control">{props.children}</span>
      <Show when={props.hint}>
        <span class="sp-field__hint">{props.hint}</span>
      </Show>
    </label>
  );
}

export function Toggle(props: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label class="sp-field sp-field--toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span class="sp-field__label">{props.label}</span>
      <Show when={props.hint}>
        <span class="sp-field__hint">{props.hint}</span>
      </Show>
    </label>
  );
}

export function NumberInput(props: {
  value: number | null;
  placeholder?: string;
  min: number;
  max: number;
  step?: number;
  onInput: (raw: string) => void;
}) {
  return (
    <input
      class="sp-input sp-input--number"
      type="number"
      value={props.value ?? ""}
      placeholder={props.placeholder}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      onInput={(e) => props.onInput(e.currentTarget.value)}
    />
  );
}

export function TextInput(props: {
  value: string;
  placeholder?: string;
  suggestions?: readonly string[];
  listId?: string;
  onInput: (value: string) => void;
}) {
  return (
    <>
      <input
        class="sp-input"
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        list={props.listId}
        spellcheck={false}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
      <Show when={props.suggestions && props.listId}>
        <datalist id={props.listId}>
          <For each={props.suggestions}>{(name) => <option value={name} />}</For>
        </datalist>
      </Show>
    </>
  );
}

export function Select<T extends string>(props: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <select
      class="sp-input"
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value as T)}
    >
      <For each={props.options}>
        {(option) => (
          <option value={option.value} selected={option.value === props.value}>
            {option.label}
          </option>
        )}
      </For>
    </select>
  );
}
