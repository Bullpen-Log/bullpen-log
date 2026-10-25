import ExpoModulesCore
import KakaoMapsSDK
import UIKit

/**
 * 카카오맵 뷰(덕아웃 연습장 · 레슨장 지도, 2026-10-25) — KakaoMapsSDK v2 를 Expo 뷰 하나로 감싼다.
 * 열쇠는 Info.plist 의 KakaoAppKey(plugins/kakao-map 이 prebuild 때 KAKAO_NATIVE_APP_KEY 로 채운다). 없거나 인증이 안 되면 onError.
 * 점(markers)을 받아 찍고, 처음 한 번 모든 점이 보이게 맞추고, 고른 점(selectedId)은 진하게 + 그 자리로 옮긴다. 점을 누르면 onMarkerPress { id }.
 */
public class KakaoMapModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KakaoMap")

    View(KakaoMapView.self) {
      Events("onReady", "onMarkerPress", "onError")

      Prop("markers") { (view: KakaoMapView, markers: [KakaoMarker]) in
        view.setMarkers(markers)
      }
      Prop("selectedId") { (view: KakaoMapView, id: String?) in
        view.setSelected(id)
      }
    }
  }
}

struct KakaoMarker: Record {
  @Field var id: String = ""
  @Field var lat: Double = 0
  @Field var lng: Double = 0
}

final class KakaoMapView: ExpoView, MapControllerDelegate {
  let onReady = EventDispatcher()
  let onMarkerPress = EventDispatcher()
  let onError = EventDispatcher()

  private static var sdkReady = false
  private static let green = UIColor(red: 0x1d / 255, green: 0x8a / 255, blue: 0x4f / 255, alpha: 1)

  private let container = KMViewContainer(frame: .zero)
  private var controller: KMController?
  private var map: KakaoMap?
  private var active = false
  private var markers: [KakaoMarker] = []
  private var selected: String?
  private var fitted = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    addSubview(container)
    guard let key = Bundle.main.object(forInfoDictionaryKey: "KakaoAppKey") as? String, !key.isEmpty else {
      DispatchQueue.main.async { [weak self] in self?.onError(["message": "no-key"]) }
      return
    }
    if !Self.sdkReady {
      SDKInitializer.InitSDK(appKey: key)
      Self.sdkReady = true
    }
    controller = KMController(viewContainer: container)
    controller?.delegate = self
    _ = controller?.prepareEngine()
  }

  deinit {
    controller?.pauseEngine()
    controller?.resetEngine()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    container.frame = bounds
    map?.viewRect = bounds
    activateIfReady()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      if active { controller?.pauseEngine() }
      active = false
    } else {
      activateIfReady()
    }
  }

  private func activateIfReady() {
    guard !active, window != nil, bounds.width > 0, bounds.height > 0, let controller else { return }
    active = true
    controller.activateEngine()
  }

  // MARK: 받는 값

  func setMarkers(_ next: [KakaoMarker]) {
    markers = next.filter { $0.lat.isFinite && $0.lng.isFinite && $0.lat != 0 }
    draw()
    if !fitted { fit() }
  }

  func setSelected(_ id: String?) {
    guard id != selected else { return }
    selected = id
    draw()
    if let id, let m = markers.first(where: { $0.id == id }), let map {
      map.moveCamera(CameraUpdate.make(target: MapPoint(longitude: m.lng, latitude: m.lat), zoomLevel: 15, mapView: map))
    }
  }

  // MARK: MapControllerDelegate

  func addViews() {
    let info = MapviewInfo(
      viewName: "map",
      viewInfoName: "map",
      defaultPosition: MapPoint(longitude: 127.0276, latitude: 37.4979),
      defaultLevel: 7
    )
    controller?.addView(info)
  }

  func addViewSucceeded(_ viewName: String, viewInfoName: String) {
    guard let map = controller?.getView("map") as? KakaoMap else { return }
    self.map = map
    map.viewRect = bounds
    setUpLayer(map)
    draw()
    fit()
    onReady([:])
  }

  func addViewFailed(_ viewName: String, viewInfoName: String) {
    onError(["message": "view"])
  }

  func authenticationFailed(_ errorCode: Int, desc: String) {
    onError(["message": "auth", "code": errorCode, "desc": desc])
  }

  func containerDidResized(_ size: CGSize) {
    map?.viewRect = CGRect(origin: .zero, size: size)
  }

  // MARK: 점

  private func setUpLayer(_ map: KakaoMap) {
    let manager = map.getLabelManager()
    _ = manager.addLabelLayer(option: LabelLayerOptions(
      layerID: "places",
      competitionType: .none,
      competitionUnit: .symbolFirst,
      orderType: .rank,
      zOrder: 10001
    ))
    let normal = PoiIconStyle(symbol: Self.pin(size: 26, color: Self.green), anchorPoint: CGPoint(x: 0.5, y: 0.5))
    let on = PoiIconStyle(symbol: Self.pin(size: 38, color: UIColor(white: 0.1, alpha: 1)), anchorPoint: CGPoint(x: 0.5, y: 0.5))
    manager.addPoiStyle(PoiStyle(styleID: "pin", styles: [PerLevelPoiStyle(iconStyle: normal, level: 0)]))
    manager.addPoiStyle(PoiStyle(styleID: "pinOn", styles: [PerLevelPoiStyle(iconStyle: on, level: 0)]))
  }

  private func draw() {
    guard let layer = map?.getLabelManager().getLabelLayer(layerID: "places") else { return }
    layer.clearAllItems()
    for m in markers {
      let isOn = m.id == selected
      let option = PoiOptions(styleID: isOn ? "pinOn" : "pin", poiID: m.id)
      option.rank = isOn ? 1 : 0
      option.clickable = true
      if let poi = layer.addPoi(option: option, at: MapPoint(longitude: m.lng, latitude: m.lat)) {
        _ = poi.addPoiTappedEventHandler(target: self, handler: KakaoMapView.tapped)
        poi.show()
      }
    }
  }

  private func tapped(_ param: PoiInteractionEventParam) {
    onMarkerPress(["id": param.poiItem.itemID])
  }

  /** 처음 한 번 — 점이 다 보이게 */
  private func fit() {
    guard let map, !markers.isEmpty else { return }
    fitted = true
    let points = markers.map { MapPoint(longitude: $0.lng, latitude: $0.lat) }
    if points.count == 1 {
      map.moveCamera(CameraUpdate.make(target: points[0], zoomLevel: 14, mapView: map))
    } else {
      map.moveCamera(CameraUpdate.make(area: AreaRect(points: points), levelLimit: 15))
    }
  }

  /** 흰 테두리 동그라미 점 */
  private static func pin(size: CGFloat, color: UIColor) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
    return renderer.image { ctx in
      let rect = CGRect(x: 0, y: 0, width: size, height: size)
      UIColor.white.setFill()
      ctx.cgContext.fillEllipse(in: rect)
      color.setFill()
      ctx.cgContext.fillEllipse(in: rect.insetBy(dx: size * 0.14, dy: size * 0.14))
    }
  }
}
