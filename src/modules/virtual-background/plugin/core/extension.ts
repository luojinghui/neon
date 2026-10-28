/**
 * XYLink Virtual Background Extension
 *
 * @summary This class provides functionalities for the XYLink virtual background plugin.
 * @author JingHui Luo <luojinghui424@gmail.com>
 *
 * Created at     : 2023-11-16 11:40:20
 * Last modified  : 2025-07-24 10:54:03
 */

import { PluginType, type IVideoProcessorConfig } from '../type';
import { VideoProcessor } from './processor';

export class XYLinkVirtualExtension {
  private version: string;
  private name: string;
  private processType: PluginType;
  private cacheModel: any;

  constructor() {
    this.version = '0.0.3';
    this.name = 'XYLinkVirtualBackground';
    this.processType = PluginType.VIDEO_INPUT;

    this.cacheModel = {};

    this.init();
  }

  public init() {
    console.info(`${this.name}_${this.version}`);
  }

  public getVersion() {
    return this.version;
  }

  public getPluginType() {
    return this.processType;
  }

  public getPluginName() {
    return this.name;
  }

  /** 获取插件内共享模型引用，调用方借用实例，不在单个效果结束时关闭。 */
  public getCacheModel() {
    return this.cacheModel;
  }

  /**
   * 合并已加载的共享模型，不覆盖本次未提供的模型项。
   * @param { object } config - 本次加载完成的 imageSegmenter 或 faceDetector 实例。
   */
  public setCacheModel(config: any) {
    this.cacheModel = { ...this.cacheModel, ...config };
  }

  /** 清除模型缓存引用；此兼容接口不调用模型实例的 close 方法。 */
  public destroy() {
    this.cacheModel = {};
  }

  /**
   * 通话侧默认所有浏览器都可尝试虚拟背景，不再按浏览器品牌或版本拦截。
   * 管线在实际处理时初始化；失败由调用方回退到原始画面。
   */
  public isSupportExtension() {
    return true;
  }

  /**
   * 创建视频处理器，模型按效果需求加载。
   *
   * @param { IVideoProcessorConfig } config - 模型与渲染配置；省略时采用处理器默认值。
   * @returns { VideoProcessor } - 新的视频处理器。
   */
  public createProcessor(config?: IVideoProcessorConfig) {
    return new VideoProcessor(config, this);
  }
}
