/** Work-order display strings. User identifiers and names are never translation keys. */
export const uiMessagesWorkInstructions: Readonly<Record<string, readonly [string, string]>> = {
  "◀ 안쪽 · {0}행부터": ["◀ Inner end · from row {0}", "◀ Đầu trong · từ hàng {0}"],
  "{0}열 {1}행 {2}단": [
    "Column {0}, row {1}, tier {2}",
    "Cột {0}, hàng {1}, tầng {2}"
  ],
  "{0}열 {1}행 {2}단 · {3}개": [
    "Columns {0}, rows {1}, tier {2} · {3} boxes",
    "Cột {0}, hàng {1}, tầng {2} · {3} thùng"
  ],
  "{0}번 · {1} · {2}열 {3}행 {4}단 · 1개 {5}": [
    "Step {0} · {1} · Column {2}, row {3}, tier {4} · {5} 1 box",
    "Bước {0} · {1} · Cột {2}, hàng {3}, tầng {4} · {5} 1 thùng"
  ],
  "행: 놓기 시작위치를 안쪽→문쪽 순서로 셉니다. 열: 같은 행에서 문을 등지고 안쪽을 볼 때 왼쪽→오른쪽. 단: 서로 다른 박스 바닥 높이를 낮은 순서로 표시합니다. 같은 시작위치는 단이 달라도 같은 행·열 번호입니다. 번호는 같은 크기의 격자나 수직 박스 개수를 뜻하지 않습니다. 도면에 없는 칸은 채우지 마세요.": [
    "Rows: box starting positions from inner end to door. Columns: left to right within each row, facing inward from the door. Tiers: distinct box-base heights, from lowest upward. The same starting position keeps its row and column across tiers. Numbers do not imply equal-sized cells or a vertical box count. Do not fill positions absent from the drawing.",
    "Hàng: các vị trí bắt đầu đặt thùng từ đầu trong ra cửa. Cột: từ trái sang phải trong từng hàng khi đứng ở cửa nhìn vào trong. Tầng: các cao độ đáy thùng khác nhau, từ thấp lên cao. Cùng vị trí bắt đầu giữ nguyên số hàng và cột ở các tầng khác nhau. Số không có nghĩa là các ô bằng nhau hay số thùng chồng đứng. Không xếp thêm vào vị trí không có trên sơ đồ."
  ],
  "놓을 방향: 길이 {0} × 폭 {1} × 높이 {2} mm": [
    "Placement orientation: length {0} × width {1} × height {2} mm",
    "Hướng đặt: dài {0} × rộng {1} × cao {2} mm"
  ],
  "작업 구역": [
    "Work zone",
    "Khu vực thao tác"
  ],
  "열 · 행 · 단 / 수량 / 품목": [
    "Column · row · tier / quantity / item",
    "Cột · hàng · tầng / số lượng / mặt hàng"
  ],
  "{0} 구역 · {1}단": [
    "Zone {0} · tier {1}",
    "Khu vực {0} · tầng {1}"
  ],
  "도면 위: 오른쪽 벽": [
    "Drawing top: right wall",
    "Phía trên sơ đồ: vách phải"
  ],
  "도면 아래: 왼쪽 벽 · 1열부터": [
    "Drawing bottom: left wall · start at column 1",
    "Phía dưới sơ đồ: vách trái · bắt đầu cột 1"
  ],
  "◀ 안쪽 · 1행부터": [
    "◀ Inner end · start at row 1",
    "◀ Đầu trong · bắt đầu hàng 1"
  ],
  "그림 번호를 작업표와 대조하세요. 색칠된 실물 박스만 적재하고 흰 빈칸은 유지합니다.": [
    "Match drawing IDs to the work table. Load only the colored boxes; keep white gaps empty.",
    "Đối chiếu mã sơ đồ với bảng thao tác. Chỉ xếp các thùng có màu; giữ nguyên khoảng trống màu trắng."
  ],
  " · {0} 구역 · {1}": [
    " · Zone {0} · {1}",
    " · Khu vực {0} · {1}"
  ],
  "{0} {1} 구역 · {2}개": [
    "{0} Zone {1} · {2} boxes",
    "{0} Khu vực {1} · {2} thùng"
  ],
  "구역 순서와 그림 번호를 따라 열·행·단별 수량을 놓으세요. 각 구역은 낮은 단부터 작업합니다.": [
    "Follow the zone order and drawing IDs to place the stated quantity at each column, row and tier. Start with the lowest tier in each zone.",
    "Theo thứ tự khu vực và mã sơ đồ, đặt đúng số lượng theo cột, hàng và tầng. Bắt đầu từ tầng thấp nhất trong từng khu vực."
  ],
  "길이·폭·높이는 놓을 방향을 확인하는 보조 치수입니다. 열·행 범위는 같은 규격의 실제 박스가 빠짐없이 있는 경우에만 묶습니다.": [
    "Length, width and height are secondary orientation checks. Column and row ranges combine only complete rectangles of actual, same-sized boxes.",
    "Dài, rộng và cao là kích thước phụ để kiểm tra hướng đặt. Chỉ gộp phạm vi cột và hàng khi có đủ các thùng thực cùng kích thước trong hình chữ nhật."
  ],
  "작업표와 같은 그림 번호·열·행·단입니다. 팔레트 없이 직접 싣는 박스의 위치를 표시합니다.": [
    "Drawing IDs, columns, rows and tiers match the work table. These are positions for directly loaded boxes without pallets.",
    "Mã sơ đồ, cột, hàng và tầng khớp với bảng thao tác. Đây là vị trí của các thùng xếp trực tiếp, không dùng pallet."
  ]
};
