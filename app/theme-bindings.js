/* Safe text interpolation. Template fields never become HTML or executable code. */
(function (root) {
  'use strict';
  const fields = {
    用户名: '用户名',
    消息: '消息正文',
    礼物: '礼物名称',
    数量: '礼物数量',
    价值: '含单位的价值',
    金额: 'SC 金额',
    等级: '舰长 / 提督 / 总督',
    剩余时间: 'SC 剩余时长',
    页码: '当前正文页',
    页数: '正文总页数',
    序号: '当前 SC 序号',
    总数: '当前 SC 数量',
  };
  const defaults = {
    normal: { name: '{用户名}', body: '{消息}' },
    gift: {
      title: '{礼物}',
      name: '赠送者：{用户名}',
      quantity: '数量：{数量}',
      value: '价值：{价值}',
      note: '备注：',
    },
    fleet: { title: '开通{等级}', name: '{用户名}' },
    sc: {
      label: '异常通讯 / SC',
      name: '{用户名}',
      amount: '¥ {金额}',
      body: '{消息}',
      timer: '{剩余时间}',
      page: '{页码} / {页数}',
    },
  };
  function context(data = {}) {
    const remaining = Math.max(0, Math.ceil(data.remaining ?? data.duration ?? 0));
    return {
      用户名: String(data.sender ?? data.username ?? '观众'),
      消息: String(data.body ?? ''),
      礼物: String(data.giftName ?? '礼物'),
      数量: String(data.quantity ?? 10),
      价值: data.coinType === 'silver' ? '免费礼物' : String(data.value ?? 1000) + ' 电池',
      金额: String(data.amount ?? 0),
      等级: { captain: '舰长', admiral: '提督', governor: '总督' }[data.rank] || '舰长',
      剩余时间:
        String(Math.floor(remaining / 60)).padStart(2, '0') +
        ':' +
        String(remaining % 60).padStart(2, '0'),
      页码: String((data.page || 0) + 1),
      页数: String(data.pages || 1),
      序号: String(data.index || 1),
      总数: String(data.count || 1),
    };
  }
  function expand(template, data) {
    const values = context(data);
    return String(template).replace(/\{([^{}]+)\}/g, (literal, key) =>
      Object.hasOwn(values, key) ? values[key] : literal,
    );
  }
  function render(part, type, data, fallback) {
    return typeof part?.template === 'string' ? expand(part.template, data) : fallback;
  }
  function available(type) {
    return type === 'gift'
      ? ['用户名', '礼物', '数量', '价值']
      : type === 'fleet'
        ? ['用户名', '等级']
        : type === 'sc'
          ? ['用户名', '消息', '金额', '剩余时间', '页码', '页数', '序号', '总数']
          : ['用户名', '消息'];
  }
  const api = { fields, defaults, context, expand, render, available };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeBindings = api;
})(globalThis);
