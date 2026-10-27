import ExpoModulesCore
import KakaoMapsSDK
import UIKit

/**
 * 카카오맵 뷰(덕아웃 연습장 · 레슨장 지도, 2026-10-25) — KakaoMapsSDK v2 를 Expo 뷰 하나로 감싼다.
 * 열쇠는 Info.plist 의 KakaoAppKey(plugins/kakao-map 이 prebuild 때 KAKAO_NATIVE_APP_KEY 로 채운다). 없거나 인증이 안 되면 onError.
 * 점(markers)을 받아 찍고, 처음 한 번 모든 점이 보이게 맞추고, 고른 점(selectedId)은 진하게 + 그 자리로 옮긴다. 점을 누르면 onMarkerPress { id }.
 * 이름(name)은 NAME_LEVEL 이상으로 확대했을 때만 점 밑에 — 멀리 보면 점만(2026-10-26 김민 "축소하면 아이콘만, 확대하면 이름"). 고른 점은 늘 이름.
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
  @Field var name: String = ""
}

final class KakaoMapView: ExpoView, MapControllerDelegate {
  let onReady = EventDispatcher()
  let onMarkerPress = EventDispatcher()
  let onError = EventDispatcher()

  private static var sdkReady = false
  private static let green = UIColor(red: 0x1d / 255, green: 0x8a / 255, blue: 0x4f / 255, alpha: 1)
  /** 이름을 붙이는 확대 정도 — 카카오 수준은 클수록 확대(15 ≈ 웹 지도의 250m 축척). 이름이 겹쳐 보이면 이 숫자를 올린다 */
  private static let nameLevel = 15

  private let container = KMViewContainer(frame: .zero)
  private var controller: KMController?
  private var map: KakaoMap?
  private var active = false
  private var markers: [KakaoMarker] = []
  private var markersByID: [String: KakaoMarker] = [:]
  private var displayed: [String: KakaoMarker] = [:]
  private var updatingMarkers = false
  private var markerRevision = 0
  private var layerGeneration = 0
  private var selected: String?
  private var drawnSelected: KakaoMarker?
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
    let valid = next.filter { $0.lat.isFinite && $0.lng.isFinite && $0.lat != 0 }
    // Expo can resend the same array when other view props change.
    guard valid.count != markers.count || !zip(valid, markers).allSatisfy({ a, b in
      a.id == b.id && a.lat == b.lat && a.lng == b.lng && a.name == b.name
    }) else { return }
    markers = valid
    markersByID = Dictionary(valid.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    markerRevision += 1
    reconcileMarkers()
    if !fitted { fit() }
  }

  func setSelected(_ id: String?) {
    guard id != selected else { return }
    let previous = selected
    selected = id
    updateSelection(previous: previous)
    if let id, let m = markersByID[id], let map {
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
    layerGeneration += 1
    updatingMarkers = false
    displayed.removeAll()
    drawnSelected = nil
    reconcileMarkers()
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
    // LOD is intended for large collections; selected items use a separate layer
    // so that a selected place stays visible even if nearby points overlap.
    _ = manager.addLodLabelLayer(option: LodLabelLayerOptions(
      layerID: "places",
      competitionType: .none,
      competitionUnit: .symbolFirst,
      orderType: .rank,
      zOrder: 10001,
      radius: 20
    ))
    _ = manager.addLabelLayer(option: LabelLayerOptions(
      layerID: "selected-place",
      competitionType: .none,
      competitionUnit: .symbolFirst,
      orderType: .rank,
      zOrder: 10002
    ))
    let normal = PoiIconStyle(symbol: Self.pin(size: 26, color: Self.green), anchorPoint: CGPoint(x: 0.5, y: 0.5))
    let on = PoiIconStyle(symbol: Self.pin(size: 38, color: UIColor(white: 0.1, alpha: 1)), anchorPoint: CGPoint(x: 0.5, y: 0.5))
    /* 이름 — 점 밑에 진한 글자 + 흰 테두리(지도 위에서 읽히게) */
    let text = PoiTextStyle(textLineStyles: [
      PoiTextLineStyle(textStyle: TextStyle(fontSize: 22, fontColor: UIColor(white: 0.11, alpha: 1), strokeThickness: 3, strokeColor: .white)),
    ])
    text.textLayouts = [.bottom]
    manager.addPoiStyle(PoiStyle(styleID: "pin", styles: [
      PerLevelPoiStyle(iconStyle: normal, level: 0),
      PerLevelPoiStyle(iconStyle: normal, textStyle: text, level: Self.nameLevel),
    ]))
    manager.addPoiStyle(PoiStyle(styleID: "pinOn", styles: [PerLevelPoiStyle(iconStyle: on, textStyle: text, level: 0)]))
  }

  private func reconcileMarkers() {
    guard let layer = map?.getLabelManager().getLodLabelLayer(layerID: "places") else { return }
    guard !updatingMarkers else { return }
    // Reconcile one snapshot at a time: removal is asynchronous in Kakao's SDK.
    let desired = markersByID
    let changes = markerChanges(current: displayed, desired: desired) { old, next in
      old.lat == next.lat && old.lng == next.lng && old.name == next.name
    }
    let removed = changes.removed
    let added = changes.added
    guard !removed.isEmpty || !added.isEmpty else { updateSelection(previous: nil); return }
    updatingMarkers = true
    let revision = markerRevision
    let generation = layerGeneration
    let finish = { [weak self] in
      guard let self, self.layerGeneration == generation else { return }
      for id in removed { self.displayed.removeValue(forKey: id) }
      self.addMarkers(added, to: layer)
      self.updatingMarkers = false
      self.updateSelection(previous: nil)
      // Props may have changed while the SDK was removing the previous snapshot.
      if self.markerRevision != revision { self.reconcileMarkers() }
    }
    if removed.isEmpty { finish() }
    else { layer.removeLodPois(poiIDs: removed) { DispatchQueue.main.async(execute: finish) } }
  }

  private func addMarkers(_ added: [KakaoMarker], to layer: LodLabelLayer) {
    let options = added.map { m in
      let option = PoiOptions(styleID: "pin", poiID: m.id)
      option.rank = 0
      option.clickable = true
      if !m.name.isEmpty {
        option.addText(PoiText(text: m.name.count > 12 ? "\(m.name.prefix(12))…" : m.name, styleIndex: 0))
      }
      return option
    }
    let positions = added.map { MapPoint(longitude: $0.lng, latitude: $0.lat) }
    if !options.isEmpty, let pois = layer.addLodPois(options: options, at: positions) {
      let byID = Dictionary(added.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
      for poi in pois {
        _ = poi.addPoiTappedEventHandler(target: self, handler: KakaoMapView.tapped)
        if let marker = byID[poi.itemID] { displayed[poi.itemID] = marker }
      }
      layer.showLodPois(poiIDs: pois.map { $0.itemID })
    }
  }

  // Change at most the previous and current marker; never rebuild the collection.
  private func updateSelection(previous: String?) {
    guard let manager = map?.getLabelManager(),
          let layer = manager.getLodLabelLayer(layerID: "places"),
          let selectedLayer = manager.getLabelLayer(layerID: "selected-place") else { return }
    if let previous { layer.getLodPoi(poiID: previous)?.show() }
    guard let id = selected, let marker = markersByID[id] else {
      if drawnSelected != nil { selectedLayer.clearAllItems(); drawnSelected = nil }
      return
    }
    if let old = drawnSelected, old.id == id, old.lat == marker.lat, old.lng == marker.lng, old.name == marker.name {
      layer.getLodPoi(poiID: id)?.hide()
      return
    }
    selectedLayer.clearAllItems()
    drawnSelected = nil
    let option = PoiOptions(styleID: "pinOn", poiID: id)
    option.rank = 1
    option.clickable = true
    if !marker.name.isEmpty {
      option.addText(PoiText(text: marker.name.count > 12 ? "\(marker.name.prefix(12))…" : marker.name, styleIndex: 0))
    }
    if let poi = selectedLayer.addPoi(option: option, at: MapPoint(longitude: marker.lng, latitude: marker.lat)) {
      layer.getLodPoi(poiID: id)?.hide()
      _ = poi.addPoiTappedEventHandler(target: self, handler: KakaoMapView.tapped)
      poi.show()
      drawnSelected = marker
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
