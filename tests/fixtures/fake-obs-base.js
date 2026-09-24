class FakeObs {
  constructor() {
    this.phase = 'connected';
    this.calls = [];
    this.scenes = [{ sceneName: '正在直播' }];
    this.inputs = [{ inputName: '游戏源', inputKind: 'game_capture' }];
    this.items = {};
    this.settings = {};
    this.id = 10;
  }
  state() {
    return { connected: this.phase === 'connected', phase: this.phase, port: 4455 };
  }
  async connect() {
    this.phase = 'connected';
  }
  disconnect() {
    this.phase = 'idle';
  }
  async call(type, d = {}) {
    this.calls.push({ type, d });
    if (this.failType === type) {
      this.failType = '';
      throw new Error('injected');
    }
    switch (type) {
      case 'GetVersion':
        return { obsVersion: '32.2.2' };
      case 'GetSceneList':
        return { scenes: this.scenes, currentProgramSceneName: '正在直播' };
      case 'GetInputList':
        return { inputs: this.inputs };
      case 'GetVideoSettings':
        return { baseWidth: 2560, baseHeight: 1440, fpsNumerator: 60000, fpsDenominator: 1001 };
      case 'GetRecordStatus':
        return { outputActive: true, outputTimecode: '01:02:03.456' };
      case 'CreateScene':
        this.scenes.push({ sceneName: d.sceneName });
        this.items[d.sceneName] = [];
        return {};
      case 'CreateSceneItem': {
        const id = ++this.id;
        this.items[d.sceneName].push({ sceneItemId: id, sourceName: d.sourceName });
        return { sceneItemId: id };
      }
      case 'CreateInput': {
        const id = ++this.id;
        this.inputs.push({ inputName: d.inputName, inputKind: d.inputKind });
        this.settings[d.inputName] = { ...d.inputSettings };
        this.items[d.sceneName].push({ sceneItemId: id, sourceName: d.inputName });
        return { sceneItemId: id };
      }
      case 'GetSceneItemList':
        return { sceneItems: this.items[d.sceneName] || [] };
      case 'GetInputSettings':
        return { inputSettings: this.settings[d.inputName] || {} };
      case 'SetSceneItemTransform':
        return {};
      case 'RemoveScene':
        this.scenes = this.scenes.filter((s) => s.sceneName !== d.sceneName);
        delete this.items[d.sceneName];
        return {};
      case 'RemoveInput':
        this.inputs = this.inputs.filter((i) => i.inputName !== d.inputName);
        delete this.settings[d.inputName];
        return {};
      default:
        throw Error('unexpected ' + type);
    }
  }
}
module.exports = FakeObs;
