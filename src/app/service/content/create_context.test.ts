import { afterEach, describe, it, expect, vi } from "vitest";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { createContext, createProxyContext, shouldFnBind } from "./create_context";

const createScriptInfo = (metadata: Record<string, string[]> = {}): TScriptInfo =>
  ({
    id: 1,
    uuid: "script-uuid",
    name: "create-context-test",
    metadata: {
      grant: ["none"],
      version: ["1.0.0"],
      ...metadata,
    },
    code: "",
    sourceCode: "",
    value: {
      foo: "bar",
      nested: { a: 1 },
    },
    resource: {},
  }) as unknown as TScriptInfo;

const createTestContext = (grants: string[], metadata: Record<string, string[]> = {}) =>
  createContext(
    createScriptInfo(metadata),
    { script: { name: "create-context-test" }, scriptMetaStr: "" },
    "vitest",
    undefined as any,
    undefined as any,
    new Set(grants)
  );

describe.concurrent("shouldFnBind", () => {
  it.concurrent("不处理非原生函数", () => {
    const o: Record<string, any> = {};
    o.targetArrowFn = () => {};
    expect(shouldFnBind(o.targetArrowFn)).toBe(false);
    o.targetArrowFn = new Proxy(o.targetArrowFn, {});
    expect(shouldFnBind(o.targetArrowFn)).toBe(false);
    o.targetFn1 = function () {};
    expect(shouldFnBind(o.targetFn1)).toBe(false);
    o.targetFn1 = new Proxy(o.targetFn1, {});
    expect(shouldFnBind(o.targetFn1)).toBe(false);
    o.targetFn2 = function targetFn2() {};
    expect(shouldFnBind(o.targetFn2)).toBe(false);
    o.targetFn2 = new Proxy(o.targetFn2, {});
    expect(shouldFnBind(o.targetFn2)).toBe(false);
  });
  it.concurrent("处理Proxy Function #985", () => {
    const o: Record<string, any> = {};
    // 例1: valueOf
    o.valueOf = global.valueOf;
    expect(shouldFnBind(o.valueOf)).toBe(true);
    o.valueOf = new Proxy(o.valueOf, {});
    expect(shouldFnBind(o.valueOf)).toBe(true);
    // 例2: setTimeoutForTest1: 验证一次拦截
    // @ts-ignore
    o.setTimeoutForTest1 = global.setTimeoutForTest1;
    expect(shouldFnBind(o.setTimeoutForTest1)).toBe(true);
    o.setTimeoutForTest1 = new Proxy(o.setTimeoutForTest1, {
      apply: (target, thisArg, argArray) => {
        console.log("proxy call", { target, thisArg, argArray });
      },
    });
    expect(shouldFnBind(o.setTimeoutForTest1)).toBe(true);
    // 例2: setTimeoutForTest2: 验证二次拦截
    // @ts-ignore
    o.setTimeoutForTest2 = global.setTimeoutForTest2;
    expect(shouldFnBind(o.setTimeoutForTest2)).toBe(true);
    o.setTimeoutForTest2 = new Proxy(o.setTimeoutForTest2, {
      apply: (target, thisArg, argArray) => {
        console.log("proxy call", { target, thisArg, argArray });
      },
    });
    expect(shouldFnBind(o.setTimeoutForTest2)).toBe(true);
  });
});

describe("createContext", () => {
  it("按 @grant 注入 GM_ 与 GM.* 双命名空间，并忽略未知 grant", async () => {
    const context = createTestContext(["GM_getValue", "GM_setValue", "GM.cookie", "not_exist"]);

    expect(context.GM.info).toBe(context.GM_info);
    expect(context.unsafeWindow).toBe(global);
    expect(context.GM_getValue("foo")).toBe("bar");
    expect(await context.GM.getValue("foo")).toBe("bar");
    expect(context.GM_setValue.name).toBe("bound GM_setValue");
    expect(context.GM.setValue.name).toBe("bound GM.setValue");
    expect(context.GM.cookie.name).toBe("bound GM.cookie");
    expect(context.GM.cookie.set.name).toBe("bound GM.cookie.set");
    expect(context.GM.cookie.list.name).toBe("bound GM.cookie.list");
    expect(context.not_exist).toBeUndefined();
  });

  it("重复 grant 与依赖 grant 会保留 GM_ / GM.* 互通", async () => {
    const context = createTestContext(["GM_getValues", "GM.getValues", "GM_getValues"]);

    expect(context.GM_getValues(["foo"])).toEqual({ foo: "bar" });
    await expect(context.GM.getValues(["foo"])).resolves.toEqual({
      foo: "bar",
    });
  });

  it("兼容 GM.Cookie 风格的多级命名空间", () => {
    const context = createTestContext(["GM_cookie"]);

    expect(context.GM_cookie.name).toBe("bound GM_cookie");
    expect(context.GM_cookie.set.name).toBe("bound GM_cookie.set");
    expect(context.GM_cookie.list.name).toBe("bound GM_cookie.list");
    expect(context.GM_cookie.delete.name).toBe("bound GM_cookie.delete");
    expect(context.GM.cookie.name).toBe("bound GM.cookie");
    expect(context.GM.cookie.set.name).toBe("bound GM.cookie.set");
    expect(context.GM.cookie.list.name).toBe("bound GM.cookie.list");
    expect(context.GM.cookie.delete.name).toBe("bound GM.cookie.delete");
  });

  it("window grant 先挂到 context.window，再由代理沙盒暴露为 window 方法", () => {
    const context = createTestContext(["window.close", "window.focus"]);
    const sandbox = createProxyContext(context);

    expect(context.close).toBeUndefined();
    expect(context.window.close.name).toBe("bound window.close");
    expect(context.window.focus.name).toBe("bound window.focus");
    expect(sandbox.close).toBe(context.window.close);
    expect(sandbox.focus).toBe(context.window.focus);
  });

  it("early-start 脚本的 CAT_scriptLoaded 会返回等待 Promise", () => {
    const context = createTestContext(["CAT_scriptLoaded"], {
      "early-start": [""],
      "run-at": ["document-start"],
    });

    expect(context.CAT_scriptLoaded()).toEqual(expect.any(Promise));
  });

  it("非 early-start 脚本的 CAT_scriptLoaded 不会产生等待 Promise", () => {
    const context = createTestContext(["CAT_scriptLoaded"], {
      "run-at": ["document-end"],
    });

    expect(context.CAT_scriptLoaded()).toBeUndefined();
  });
});

describe("createProxyContext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("隔离沙盒全局对象、保护内部字段，并提供一次性的 $ 入口", () => {
    const context = createTestContext(["GM_getValue"]);
    const sandbox = createProxyContext(context);

    expect(sandbox.window).toBe(sandbox);
    expect(sandbox.self).toBe(sandbox);
    expect(sandbox.globalThis).toBe(sandbox);
    expect(sandbox.parent).toBe(sandbox);
    expect(Object.getPrototypeOf(sandbox)).toBeNull();
    expect(Object.prototype.toString.call(sandbox)).toBe(Object.prototype.toString.call(global));
    expect(sandbox.constructor).toBe(global.constructor);
    // jsdom 的 top/frames 会返回 Window proxy；真实浏览器自引用由 example/tests/sandbox_test.js 覆盖。
    expect(sandbox.GM_getValue("foo")).toBe("bar");
    expect(sandbox.unsafeWindow).toBe(global);
    expect(sandbox.define).toBeUndefined();
    expect(sandbox.module).toBeUndefined();
    expect(sandbox.exports).toBeUndefined();
    expect(sandbox.console).not.toBe(console);
    expect(sandbox.console.log).toBe(console.log);

    const firstDollarRead = sandbox.$;
    expect(firstDollarRead).toBe(sandbox);
    expect("$" in sandbox).toBe(false);
    expect(sandbox.$).toBeUndefined();
  });

  it("Object.prototype 污染不会穿透到沙盒 window", () => {
    const key = `polluted_${Date.now()}`;
    try {
      //@ts-ignore
      Object.prototype[key] = "polluted";
      const sandbox = createProxyContext(createTestContext([]));

      expect({}[key]).toBe("polluted");
      expect(sandbox[key]).toBeUndefined();
      expect(key in sandbox).toBe(false);
    } finally {
      //@ts-ignore
      delete Object.prototype[key];
    }
  });

  it("原生函数会绑定到真实 global，避免作为裸函数调用时报 Illegal invocation", () => {
    const sandbox = createProxyContext(createTestContext([]));
    const setTimeoutForTest1 = sandbox.setTimeoutForTest1;

    expect(() => setTimeoutForTest1(() => undefined, 0)).not.toThrow();
  });

  it("onxxx 事件属性使用沙盒 this，并在清空后移除页面监听", () => {
    const addEventListener = vi.spyOn(global, "addEventListener");
    const removeEventListener = vi.spyOn(global, "removeEventListener");
    const sandbox = createProxyContext(createTestContext([]));
    const onload = vi.fn(function (this: any) {
      expect(this).toBe(sandbox);
    });

    sandbox.onload = onload;
    expect(addEventListener).toHaveBeenCalledWith("load", expect.any(Object));

    const eventObject = addEventListener.mock.calls.find(([name]) => name === "load")?.[1] as EventListenerObject;
    eventObject.handleEvent(new Event("load"));
    expect(onload).toHaveBeenCalledTimes(1);

    sandbox.onload = null;
    expect(removeEventListener).toHaveBeenCalledWith("load", eventObject);
  });

  it("onxxx primitive 会转为 null，普通对象只保存不注册监听", () => {
    const addEventListener = vi.spyOn(global, "addEventListener");
    const sandbox = createProxyContext(createTestContext([]));
    const listenerObject = { handleEvent: vi.fn() };

    //@ts-ignore
    sandbox.onload = 123;
    expect(sandbox.onload).toBeNull();

    //@ts-ignore
    sandbox.onload = "text";
    expect(sandbox.onload).toBeNull();

    //@ts-ignore
    sandbox.onload = listenerObject;
    expect(sandbox.onload).toBe(listenerObject);
    expect(addEventListener).not.toHaveBeenCalledWith("load", expect.any(Object));
  });

  it("onxxx 函数替换不会重复注册监听，并且只调用最新函数", () => {
    const addEventListener = vi.spyOn(global, "addEventListener");
    const removeEventListener = vi.spyOn(global, "removeEventListener");
    const sandbox = createProxyContext(createTestContext([]));
    const oldHandler = vi.fn();
    const newHandler = vi.fn();

    sandbox.onload = oldHandler;
    sandbox.onload = newHandler;

    const loadListeners = addEventListener.mock.calls.filter(([name]) => name === "load");
    expect(loadListeners).toHaveLength(1);

    const eventObject = loadListeners[0][1] as EventListenerObject;
    eventObject.handleEvent(new Event("load"));
    expect(oldHandler).not.toHaveBeenCalled();
    expect(newHandler).toHaveBeenCalledTimes(1);

    sandbox.onload = null;
    expect(removeEventListener).toHaveBeenCalledWith("load", eventObject);
  });

  it("onxxx 从函数改为普通对象时会移除页面监听，只保存对象值", () => {
    const addEventListener = vi.spyOn(global, "addEventListener");
    const removeEventListener = vi.spyOn(global, "removeEventListener");
    const sandbox = createProxyContext(createTestContext([]));
    const handler = vi.fn();
    const listenerObject = { handleEvent: vi.fn() };

    sandbox.onload = handler;
    const eventObject = addEventListener.mock.calls.find(([name]) => name === "load")?.[1] as EventListenerObject;

    //@ts-ignore
    sandbox.onload = listenerObject;

    expect(handler).not.toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalledWith("load", eventObject);
    expect(sandbox.onload).toBe(listenerObject);
  });
});
