import { describe, expect, test } from 'bun:test';

import { createA11y } from './createA11y';

const react = createA11y({ lint: 'biome' });
const html = createA11y({ lint: 'biome', output: 'html' });

describe('createA11y runtime', () => {
  test('react output keeps values and prepends role', () => {
    expect(react('switch', { checked: true, label: 'Wi-Fi' })).toEqual({
      role: 'switch',
      'aria-checked': true,
      'aria-label': 'Wi-Fi',
    });
  });

  test('html output stringifies boolean and number values', () => {
    expect(
      html('combobox', { expanded: false, controls: 'm', label: 'x' }),
    ).toEqual({
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': 'm',
      'aria-label': 'x',
    });
    expect(html('separator', { valuenow: 50, label: 'x' })).toEqual({
      role: 'separator',
      'aria-valuenow': '50',
      'aria-label': 'x',
    });
  });

  test('mixed value passes through unchanged', () => {
    expect(react('switch', { checked: 'mixed', label: 'x' })).toEqual({
      role: 'switch',
      'aria-checked': 'mixed',
      'aria-label': 'x',
    });
  });

  test('idlist array joins with single space', () => {
    expect(
      react('combobox', {
        expanded: true,
        controls: ['a', 'b'],
        label: 'x',
      }),
    ).toEqual({
      role: 'combobox',
      'aria-expanded': true,
      'aria-controls': 'a b',
      'aria-label': 'x',
    });
  });

  test('empty idlist array emits no key', () => {
    expect(
      react('combobox', { expanded: true, controls: [], label: 'x' }),
    ).toEqual({
      role: 'combobox',
      'aria-expanded': true,
      'aria-label': 'x',
    });
    // img 名字必填，空元组 labelledby 被 NameEmptyCheck 拦在类型层；
    // 这里用名字可选的 separator 验证同一条运行时跳过路径
    expect(react('separator', { label: 'x', labelledby: [] })).toEqual({
      role: 'separator',
      'aria-label': 'x',
    });
  });

  test('empty string name and idlist values emit no key', () => {
    // img 名字必填，label '' 被 NameEmptyCheck 拦在类型层；
    // 这里用名字可选的 separator 验证同一条运行时跳过路径
    expect(react('separator', { label: '' })).toEqual({ role: 'separator' });
    expect(react('separator', { label: 'x', labelledby: '' })).toEqual({
      role: 'separator',
      'aria-label': 'x',
    });
    expect(
      react('combobox', { expanded: true, controls: '', label: 'x' }),
    ).toEqual({
      role: 'combobox',
      'aria-expanded': true,
      'aria-label': 'x',
    });
    expect(react.aria({ label: '', controls: '' })).toEqual({});
  });

  test('undefined name value and all-empty idlist arrays emit no key', () => {
    // img 名字必填，空值名字键（含 undefined）被 NameEmptyCheck 拦在
    // 类型层；这里用名字可选的 separator 验证同一条运行时跳过路径
    expect(react('separator', { label: 'x', labelledby: undefined })).toEqual({
      role: 'separator',
      'aria-label': 'x',
    });
    // [''] join 出 ''、['',''] join 出 ' '，trim 后为空：按没传跳过
    expect(react('separator', { label: 'x', labelledby: [''] })).toEqual({
      role: 'separator',
      'aria-label': 'x',
    });
    expect(react('separator', { label: 'x', labelledby: ['', ''] })).toEqual({
      role: 'separator',
      'aria-label': 'x',
    });
  });

  test('undefined optional value emits no key', () => {
    expect(react('img', { label: 'x', details: undefined })).toEqual({
      role: 'img',
      'aria-label': 'x',
    });
  });

  test('focusable true emits tabIndex in react mode', () => {
    expect(react('separator', { focusable: true, valuenow: 50 })).toEqual({
      role: 'separator',
      tabIndex: 0,
      'aria-valuenow': 50,
    });
  });

  test('focusable true emits tabindex string in html mode', () => {
    expect(html('separator', { focusable: true, valuenow: 50 })).toEqual({
      role: 'separator',
      tabindex: '0',
      'aria-valuenow': '50',
    });
  });

  test('focusable undefined variable emits no tabIndex', () => {
    const maybeFocus: true | undefined = undefined;
    expect(react('separator', { focusable: maybeFocus, valuenow: 50 })).toEqual(
      {
        role: 'separator',
        'aria-valuenow': 50,
      },
    );
  });

  test('aria() emits state attrs without role', () => {
    expect(react.aria({ expanded: true, controls: ['a', 'b'] })).toEqual({
      'aria-expanded': true,
      'aria-controls': 'a b',
    });
    expect(html.aria({ expanded: false })).toEqual({
      'aria-expanded': 'false',
    });
  });
});
