const Base = require('./fake-obs-base.js');
class FakeObs extends Base {
  constructor() {
    super();
    this.collection = '测试集合';
  }
  async call(type, d = {}) {
    const item = () => this.items[d.sceneName]?.find((i) => i.sceneItemId === d.sceneItemId);
    if (
      [
        'GetSceneCollectionList',
        'SetInputSettings',
        'SetSceneItemIndex',
        'SetSceneItemEnabled',
        'RemoveSceneItem',
        'GetSceneItemTransform',
      ].includes(type)
    ) {
      this.calls.push({ type, d });
      switch (type) {
        case 'GetSceneCollectionList':
          return { currentSceneCollectionName: this.collection };
        case 'SetInputSettings':
          Object.assign(this.settings[d.inputName], d.inputSettings);
          return {};
        case 'SetSceneItemIndex':
          if (item()) item().sceneItemIndex = d.sceneItemIndex;
          return {};
        case 'SetSceneItemEnabled':
          if (item()) item().sceneItemEnabled = d.sceneItemEnabled;
          return {};
        case 'RemoveSceneItem':
          this.items[d.sceneName] = this.items[d.sceneName].filter(
            (i) => i.sceneItemId !== d.sceneItemId,
          );
          return {};
        case 'GetSceneItemTransform':
          return { sceneItemTransform: item().sceneItemTransform };
      }
    }
    const result = await super.call(type, d);
    if (type === 'SetSceneItemTransform')
      Object.assign(item(), {
        sceneItemTransform: { ...item().sceneItemTransform, ...d.sceneItemTransform },
      });
    if (type === 'GetInputSettings')
      result.inputKind = this.inputs.find((i) => i.inputName === d.inputName)?.inputKind;
    return result;
  }
}
module.exports = FakeObs;
