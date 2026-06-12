import { describe, expect, it } from 'bun:test';

import { implTraits } from './implTraits';

// ── 实验基础类 ──────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
class Counter {
  count = 0;
  label = 'counter';

  testLabel() {
    return `testLabel:${this.display}`;
  }
}

// ── 实验 1：方法 trait，this 能否感知宿主属性 + trait 自身方法 ────────────────
//
// 声明式模式：
//   type MyTrait = { ... }           ← 声明 trait 类型
//   implTraits(Host, { ... })         ← 实现（this 自动推断为 Host & MyTrait）
//   interface Host extends MyTrait {} ← 扩展实例类型

type IncrementTrait = {
  increment(step?: number): Counter;
  reset(): Counter;
  double(): Counter;
};

implTraits(Counter, {
  increment(step = 1) {
    this.count += step; // this.count ← Counter
    return this;
  },
  reset() {
    this.count = 0; // this.count ← Counter
    return this;
  },
  double() {
    return this.increment(this.count); // this.increment ← IncrementTrait，this.count ← Counter
  },
});
// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface Counter extends IncrementTrait {}

// ── 实验 2：getter trait，defineProperty 能否正确挂载 ──────────────────────

type LabelTrait = {
  display: string;
};

implTraits(Counter, {
  get display(): string {
    return `${this.label}(${this.count})`; // this.label, this.count ← Counter
  },
});
// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface Counter extends LabelTrait {}

// ── 实验 3：工厂 trait（带参数），this 需显式声明 ────────────────────────────
//
// implTraits 的 ThisType 在调用处生效，但工厂函数内部定义对象时编译器无法
// 自动感知宿主类型，需通过显式 this 参数或泛型约束来补充。
//
// 推荐写法：this 参数约束宿主结构，工厂与具体 Host 类解耦：
//   function createFooTrait<Host extends { needed: Type }>(opts) {
//     return { method(this: Host) { ... } }
//   }

type PrefixTrait = { prefixed(): string };

function createPrefixTrait<Host extends { label: string }>(prefix: string) {
  return {
    prefixed(this: Host) {
      return `${prefix}::${this.label}`; // this.label ← Host 约束
    },
  };
}

implTraits(Counter, createPrefixTrait<Counter>('app'));
interface Counter extends PrefixTrait {}

// ── 运行时验证 ───────────────────────────────────────────────────────────────

describe('traits/core', () => {
  describe('implTraits — prototype extension', () => {
    it('trait methods are callable on instances', () => {
      const c = new Counter();
      c.increment(3);
      expect(c.count).toBe(3);
      c.reset();
      expect(c.count).toBe(0);
    });

    it('trait method can call sibling trait method via this', () => {
      const c = new Counter();
      c.count = 4;
      c.double(); // double() calls increment(this.count)
      expect(c.count).toBe(8);
    });

    it('getter is correctly mounted via defineProperty', () => {
      const c = new Counter();
      c.count = 5;
      expect(c.display).toBe('counter(5)');
    });

    it('host class method can access trait getter via this', () => {
      const c = new Counter();
      c.count = 3;
      expect(c.testLabel()).toBe('testLabel:counter(3)');
    });

    it('factory trait closes over external params', () => {
      const c = new Counter();
      expect(c.prefixed()).toBe('app::counter');
    });

    it('implTraits does not override constructor', () => {
      const c = new Counter();
      expect(c.constructor).toBe(Counter);
    });

    it('traits live on the prototype, not the instance', () => {
      const c = new Counter();
      expect(Object.hasOwn(c, 'increment')).toBe(false);
      expect(typeof Counter.prototype.increment).toBe('function');
    });

    it('multiple instances share the same trait method reference', () => {
      const a = new Counter();
      const b = new Counter();
      expect(a.increment).toBe(b.increment);
    });
  });

  describe('isCtor guard (via implTraits)', () => {
    it('implTraits is a no-op on non-constructor', () => {
      const arrow = () => {};
      expect(() => implTraits(arrow as never, { x() {} })).not.toThrow();
    });
  });

  describe('Symbol key support', () => {
    it('[Symbol.iterator] is copied to prototype', () => {
      class NumberList {
        items: number[];
        constructor(...items: number[]) {
          this.items = items;
        }
      }

      implTraits(NumberList, {
        [Symbol.iterator](this: NumberList) {
          return this.items[Symbol.iterator]();
        },
      });

      const list = new NumberList(1, 2, 3);
      expect([...(list as unknown as Iterable<number>)]).toEqual([1, 2, 3]);
    });

    it('[Symbol.toPrimitive] is copied to prototype', () => {
      class Box {
        value: number;
        constructor(v: number) {
          this.value = v;
        }
      }

      implTraits(Box, {
        [Symbol.toPrimitive](this: Box, hint: string) {
          return hint === 'string' ? `Box(${this.value})` : this.value;
        },
      });

      const box = new Box(42);
      expect(+box).toBe(42);
      expect(`${box}`).toBe('Box(42)');
    });

    it('user-defined Symbol method is copied', () => {
      const kTag = Symbol('tag');

      class Tagged {}

      implTraits(Tagged, {
        [kTag](this: Tagged) {
          return 'tagged';
        },
      });

      const t = new Tagged();
      // biome-ignore lint/suspicious/noExplicitAny: symbol indexing requires any cast
      expect((t as any)[kTag]()).toBe('tagged');
    });

    it('Symbol methods live on the prototype, not the instance', () => {
      class Thing {}

      implTraits(Thing, {
        [Symbol.iterator](this: Thing) {
          return [][Symbol.iterator]();
        },
      });

      const t = new Thing();
      expect(Object.hasOwn(t, Symbol.iterator)).toBe(false);
      // biome-ignore lint/suspicious/noExplicitAny: symbol indexing requires any cast
      expect(typeof (Thing.prototype as any)[Symbol.iterator]).toBe('function');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// implTraits 实验：User 类 + 多 trait 批量混入
// 核心问题：trait1 能否通过 this 感知 trait2 的方法？（跨 trait 互调）
// ════════════════════════════════════════════════════════════════════════════

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
class User {
  name = 'Alice';
  age = 30;
  scores: number[] = [80, 90, 75];
}

// trait 类型声明
type UserGreetTrait = { greet(): string };
type UserAgeTrait = { isAdult(): boolean; ageGroup(): string };
type UserStatTrait = { avgScore(): number; summary(): string };

implTraits(
  User,
  // trait 1：greet — 跨 trait 调用 ageGroup()（来自 trait 2）
  {
    greet() {
      return `Hi, I'm ${this.name}, I am ${this.ageGroup()}.`; // this.ageGroup ← UserAgeTrait
    },
  },
  // trait 2：age — 内部互调 isAdult()
  {
    isAdult() {
      return this.age >= 18; // this.age ← User
    },
    ageGroup() {
      return this.isAdult() ? 'adult' : 'minor'; // this.isAdult ← 同 trait
    },
  },
  // trait 3：stat — 跨 trait 调用 ageGroup()（来自 trait 2）
  {
    avgScore() {
      const sum = this.scores.reduce((a, b) => a + b, 0); // this.scores ← User
      return Math.round(sum / this.scores.length);
    },
    summary() {
      return `${this.ageGroup()} | avg: ${this.avgScore()}`; // 跨 trait 互调
    },
  },
);

// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface User extends UserGreetTrait, UserAgeTrait, UserStatTrait {}

describe('implTraits — User', () => {
  it('host class properties are accessible in each trait', () => {
    const u = new User();
    expect(u.isAdult()).toBe(true);
    expect(u.avgScore()).toBe(82);
  });

  it('intra-trait method call (isAdult → ageGroup)', () => {
    const u = new User();
    expect(u.ageGroup()).toBe('adult');
  });

  it('cross-trait call from trait1 to trait2 (greet → ageGroup)', () => {
    const u = new User();
    expect(u.greet()).toBe("Hi, I'm Alice, I am adult.");
  });

  it('cross-trait call from trait3 to trait2 (summary → ageGroup + avgScore)', () => {
    const u = new User();
    expect(u.summary()).toBe('adult | avg: 82');
  });

  it('minor user path', () => {
    const u = new User();
    u.age = 15;
    expect(u.isAdult()).toBe(false);
    expect(u.ageGroup()).toBe('minor');
    expect(u.greet()).toBe("Hi, I'm Alice, I am minor.");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 继承与重载测试
//
// 核心问题：
//   1. 子类是否能通过原型链自动继承父类 trait？
//   2. 子类能否 implTraits 覆盖父类同名方法，且两者互不影响？
//   3. 父类 trait 方法的 this，在子类实例上调用时是否指向子类实例？
//   4. 描述符 configurable 是否为 true（覆盖得了）？
// ════════════════════════════════════════════════════════════════════════════

// ── 场景 A / B / C：基础继承 + 子类覆盖 ─────────────────────────────────────

const VehicleStep = 20;
const MoveInitX = 0;
const MoveInitY = 0;

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
class Vehicle {
  type = 'vehicle';
  config = { color: 'gray' }; // 父类默认配置
  step = VehicleStep;
}

type MotionTrait = { x: number; y: number; move(): string; describe(): string };

implTraits(Vehicle, {
  x: MoveInitX,
  y: MoveInitY,
  move() {
    this.x += this.step;
    this.y += this.step;
    return `${this.type} is moving`;
  },
  describe() {
    return `[${this.config.color}] ${this.type}`;
  },
});

// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface Vehicle extends MotionTrait {}

const CarStartX = 100;

// Car：不单独调用 implTraits，完全依赖原型链继承父类 trait
class Car extends Vehicle {
  constructor() {
    super();
    this.type = 'car';
    this.config = { color: 'red' }; // 子类在构造器里覆盖配置
    this.x = CarStartX;
  }
}

const TrackStep = 30;
const TrackStartY = 20;

// Truck：通过 implTraits 覆盖父类的 move()，describe() 仍继承自父类
class Truck extends Vehicle {
  y = TrackStartY;

  constructor() {
    super();
    this.type = 'truck';
    this.step = TrackStep;
  }

  move() {
    super.move();
    return `heavy ${this.type} is moving slowly`;
  }
}

// ── 场景 D：父类默认 config，子类构造器覆盖 ──────────────────────────────────
// 验证：trait 方法通过 this 访问 config 时，
//       读到的是各自实例的值，而不是父类原型上的默认值

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
class Service {
  name = 'service';
  config = { color: 'blue', prefix: 'svc' }; // 父类默认
}

type ServiceTrait = { label(): string };

implTraits(Service, {
  label() {
    return `[${this.config.color}/${this.config.prefix}] ${this.name}`;
  },
});

// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface Service extends ServiceTrait {}

class ApiService extends Service {
  constructor() {
    super();
    this.name = 'api';
    this.config = { color: 'green', prefix: 'api' }; // 子类覆盖
  }
}

// ── 断言 ────────────────────────────────────────────────────────────────────

describe('implTraits — inheritance & override', () => {
  describe('prototype chain inheritance', () => {
    it('child instance has access to parent trait methods', () => {
      const car = new Car();
      expect(car.move()).toBe('car is moving');
      expect(car.x).toBe(CarStartX + VehicleStep);
      expect(car.y).toBe(MoveInitY + VehicleStep);
    });

    it('this in parent trait reflects child instance properties', () => {
      const car = new Car();
      expect(car.describe()).toBe('[red] car'); // config.color from Car constructor
    });

    it('child inherits parent trait method reference (same prototype slot)', () => {
      const car = new Car();
      const v = new Vehicle();
      expect(car.move).toBe(v.move); // Car has no own move, walks up to Vehicle.prototype
    });
  });

  describe('child override via implTraits', () => {
    it('child override applies only to child prototype', () => {
      const truck = new Truck();
      expect(truck.move()).toBe('heavy truck is moving slowly');
      expect(truck.x).toBe(MoveInitX + TrackStep);
      expect(truck.y).toBe(TrackStartY + TrackStep);
    });

    it('parent prototype is unchanged after child override', () => {
      const v = new Vehicle();
      expect(v.move()).toBe('vehicle is moving');
    });

    it('child and parent have different prototype slot for overridden method', () => {
      expect(Truck.prototype.move).not.toBe(Vehicle.prototype.move);
    });

    it('non-overridden methods still walk up to parent prototype', () => {
      const truck = new Truck();
      expect(truck.describe()).toBe('[gray] truck'); // describe not overridden
      expect(truck.describe).toBe(Vehicle.prototype.describe);
    });
  });

  describe('configurable descriptor allows child override', () => {
    it('trait methods on prototype have configurable: true', () => {
      const d = Object.getOwnPropertyDescriptor(Vehicle.prototype, 'move');
      expect(d?.configurable).toBe(true);
    });

    it('child can redefine parent trait via implTraits (confirms configurable)', () => {
      // If configurable were false, implTraits on Truck would throw TypeError
      expect(() => {
        class TestChild extends Vehicle {}
        implTraits(TestChild, {
          move() {
            return 'redefined';
          },
        });
        expect(new TestChild().move()).toBe('redefined');
      }).not.toThrow();
    });
  });

  describe('per-instance config (parent default, child override in constructor)', () => {
    it('parent instance uses its own config', () => {
      const svc = new Service();
      expect(svc.label()).toBe('[blue/svc] service');
    });

    it('child instance uses its overridden config from constructor', () => {
      const api = new ApiService();
      expect(api.label()).toBe('[green/api] api');
    });

    it('child and parent instances are independent — no shared state', () => {
      const svc = new Service();
      const api = new ApiService();
      svc.config.color = 'purple'; // mutate parent instance
      expect(api.config.color).toBe('green'); // child unaffected
    });
  });
});
