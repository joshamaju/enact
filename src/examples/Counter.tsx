import { sleep } from "effection";
import { ref, enact, useValue } from "../enact.tsx";

/**
 * ```ts
 * function AppClassic() {
    const [count, setCount] = useState(0);

    return (
      <button type="button" onClick={() => setCount((count) => count + 1)}>
        count is {count}
      </button>
    );
  }
  ```
 */
export const Counter = enact(function* () {
  let count = useValue(0);

  const node = yield* ref(
    <button type="button" onClick={() => count.set(count.current + 1)}>
      count is <count.react />
    </button>
  );

  const dom = yield* node;

  yield* sleep(2000);

  dom.style.backgroundColor = 'red';

  yield* sleep(2000);

  dom.style.backgroundColor = 'blue';
})