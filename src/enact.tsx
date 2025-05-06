import {
  call,
  createChannel,
  createContext,
  createScope,
  createSignal,
  each,
  type Operation,
  resource,
  spawn,
  Stream,
  withResolvers,
  WithResolvers,
} from "effection";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, useEffect, useState } from "react";

export interface EnactComponent<T> {
  (props: T): Operation<ReactNode | void>;
}

export interface ReactComponent<T> {
  (props: T): ReactNode;
}

export function* render(node: ReactNode): Operation<void> {
  let setContent = yield* RenderContext.expect();
  setContent(node);
}

export const $ = render;

function HOC({
  children,
  resolver,
}: {
  children: ReactElement;
  resolver: WithResolvers<any>;
}) {
  const [ref, set_ref] = useState(null);

  useEffect(() => {
    if (ref) resolver.resolve(ref);
  }, [ref]);

  // @ts-expect-error
  return cloneElement(children, { ref: set_ref });
}

export function* ref<T extends keyof HTMLElementTagNameMap>(
  current: ReactElement
) {
  const resolver = withResolvers<HTMLElementTagNameMap[T]>();
  yield* render(<HOC resolver={resolver}>{current}</HOC>);
  return resolver.operation;
}

export function useRef<T extends HTMLElement>() {
  const ref = {current: null};
  const resolver = withResolvers<T>();

  const fn = resource<T>(function*(provide) {
    yield* provide(yield* resolver.operation)
  })

  return {
    [Symbol.iterator]: fn[Symbol.iterator],
    get current() {
      return ref.current;
    },
    set current(node: any) {
      ref.current = node;
      resolver.resolve(node)
    }
  }
}

const RenderContext = createContext<(node: ReactNode) => void>("enact.render");

export function enact<T>(component: EnactComponent<T>): ReactComponent<T> {
  return (props: T) => {
    let [content, setContent] = useState<ReactNode>(null);

    useEffect(() => {
      let [scope, destroy] = createScope();
      scope.set(RenderContext, setContent);
      scope.run(function* () {
        try {
          let result = yield* component(props);
          if (result) {
            setContent(result);
          }
        } catch (e) {
          let error = e as Error;
          setContent(
            <>
              <h1>Component Crash</h1>
              <h3>{error?.message}</h3>
              <pre>{error?.stack}</pre>
            </>,
          );
        }
      });
      return () => { destroy() };
    }, []);

    return content;
  };
}

export interface Value<T> extends Computed<T> {
  current: T;
  set(value: T): void;
  is(value: T): Operation<boolean>;
}

export function useValue<T>(initial: T): Value<T> {
  let ref = { current: initial };
  let values = createSignal<T>();

  let set = (value: T) => {
    if (value !== ref.current) {
      ref.current = value;
      values.send(value);
    }
  };

  function is(value: T): Operation<boolean> {
    return call(function* () {
      if (value === ref.current) {
        return true;
      } else {
        for (let next of yield* each(values)) {
          if (next === value) {
            return true;
          }
          yield* each.next();
        }
        return false;
      }
    });
  }

  let computed = compute<T>(function* (emit) {
    yield* emit(ref.current);

    for (let value of yield* each(values)) {
      yield* emit(value);
      yield* each.next();
    }
  });

  return {
    get current() {
      return ref.current;
    },
    is,
    set,
    react: computed.react,
    [Symbol.iterator]: computed[Symbol.iterator],
  };
}

export interface Computed<T> extends Stream<T, never> {
  react: ReactComponent<Record<string | symbol, never>>;
}

export function compute<T>(
  body: (emit: (value: T) => Operation<void>) => Operation<void>,
): Computed<T> {
  let { send: emit, ...stream } = createChannel<T, never>();
  let computed: Stream<T, never> = resource(function* (provide) {
    let subscription = yield* stream;
    yield* spawn(() => body(emit));

    yield* provide(subscription);
  });

  let react = enact<Record<string, never>>(function* () {
    for (let value of yield* each(computed)) {
      yield* $(String(value));
      yield* each.next();
    }
  });

  return {
    react,
    [Symbol.iterator]: computed[Symbol.iterator],
  };
}

export function map<A, B, C>(
  stream: Stream<A, C>,
  fn: (value: A) => B,
): Stream<B, C> {
  return {
    *[Symbol.iterator]() {
      let source = yield* stream;
      return {
        *next() {
          let  next = yield* source.next();
          return next.done ? next : ({ done: false, value: fn(next.value) });
        },
      };
    },
  };
}
