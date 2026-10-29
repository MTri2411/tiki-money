# Kiến trúc hệ thống

Sổ chi tiêu chạy local-first. Mọi khoản tiền, tin nhắn, danh mục và nút ghi nhanh nằm trong một file SQLite trên máy. Màn hình chỉ nói chuyện với `@/lib/db`. Gemini đề xuất khoản hoặc khoảng ngày cần tính. Sổ chỉ ghi khi người dùng xác nhận. Câu hỏi về số đã ghi được trả lời từ bảng `tx`, không lấy số từ mô hình.

Đăng nhập Google qua Supabase chỉ giữ phiên. Không có bảng sổ trên cloud và không có hàng đợi đồng bộ.

## Bố cục

```text
app/so-chi-tieu.tsx          chat, xác nhận draft, sửa và xoá khoản
components/CategoryProvider  danh mục trong bộ nhớ
components/DynamicIsland     hiện tổng ngày và tháng do màn sổ tải
lib/gemini.ts                gọi mô hình, rồi gắn bản sửa hoặc tính tổng
lib/query.ts                 khoảng ngày và câu trả lời có số
lib/revise.ts                gắn draft vào khoản đã có khi người dùng sửa lời
lib/category-match.ts        danh mục mặc định và tinh chỉnh tên
lib/db/                      sổ local — cửa vào duy nhất
lib/account.ts               hồ sơ đăng nhập (SecureStore / localStorage)
lib/supabase.ts              client auth, không đụng bảng sổ
```

```text
Người dùng
    │  chữ, ghi âm, hoặc nút ghi nhanh
    ▼
so-chi-tieu
    │
    ├─ câu hỏi số liệu
    │     Gemini trả intent query + khoảng ngày
    │     txsBetween → speakLedger → câu có số
    │
    └─ khoản mới hoặc sửa khoản
          Gemini trả draft
          refineDrafts + planRevisions (120 ngày gần nhất)
          draft lưu vào msg, chưa có dòng tx
          │
          │ xác nhận
          ▼
          một transaction SQLite
          tx · msg.tx_id · category.usage_count
```

## Sổ local

File: `so-chi-tieu.db` (`expo-sqlite`). Mở một lần trong `openLedger`, giữ promise ở `getDb`.

`expo-sqlite` không cho một câu kết thúc khi câu khác đang ghi. Mọi hàm công khai đi qua `runDb`: hàng đợi promise, việc sau chờ việc trước, lỗi của việc trước không chặn việc sau.

Ghi nhiều bảng thì bọc `withWriteTransaction` (`db.withTransactionAsync`). Hàm bên trong transaction không được gọi lại `runDb`, nếu không hàng đợi tự khoá.

| File            | Việc                                              |
| --------------- | ------------------------------------------------- |
| `index.ts`      | Xuất hàm và kiểu. Màn hình không import file con. |
| `connection.ts` | `getDb`, `runDb`, `withWriteTransaction`          |
| `schema.ts`     | Tạo bảng, nhận sổ cũ, seed, đếm lại usage         |
| `tx.ts`         | Giao dịch, tổng, xác nhận, sửa, xoá, hoàn tác     |
| `messages.ts`   | Tin nhắn và parser payload                        |
| `categories.ts` | Danh mục và `usage_count`                         |
| `chips.ts`      | Đọc nút ghi nhanh                                 |
| `dates.ts`      | Ngày theo giờ Việt Nam                            |
| `types.ts`      | Kiểu dòng và payload                              |

PRAGMA lúc mở: `journal_mode = WAL`, `busy_timeout = 5000`.

### Nhận sổ cũ

Sổ cũ là bảng `tx` hoặc `transactions` còn một trong các cột `owner_id`, `user_id`, `device_id`, `updated_at`, `deleted_at`.

`openLedger` đọc các dòng còn dùng được vào bộ nhớ, rồi trong một transaction xoá bảng cũ, tạo sổ mới và chép lại. Transaction lỗi thì bảng cũ còn nguyên. Dòng `deleted_at` khác null bị bỏ. Role lạ, trong đó có `card`, bị bỏ. Sau khi mở, mọi tin `role = card` còn sót cũng bị xoá.

Cột chép được: khoản (`id`, `amount`, `direction`, `category`, `note`, `date`, `created_at`), tin, danh mục, nút ghi nhanh. Hướng chỉ giữ `chi` và `thu`. Số tiền phải dương, ngày phải `YYYY-MM-DD`.

### Bốn bảng

Không có `user_id`, `device_id`, `version`, `updated_at`, `deleted_at`.

**`tx`** — khoản đã ghi.

| Cột          | Ý nghĩa                     |
| ------------ | --------------------------- |
| `id`         | UUID, khoá chính            |
| `amount`     | Số nguyên VND, `> 0`        |
| `direction`  | `chi` hoặc `thu`            |
| `category`   | Tên danh mục, không phải id |
| `note`       | Ghi chú, có thể null        |
| `date`       | `YYYY-MM-DD`                |
| `created_at` | Epoch millisecond           |

Index: `tx_date` trên `(date, created_at DESC)`.

**`msg`** — một dòng chat.

| Cột          | Ý nghĩa                                      |
| ------------ | -------------------------------------------- |
| `id`         | UUID                                         |
| `role`       | `user`, `assistant`, `draft`, `receipt`, `deleted`, `cleared` |
| `text`       | Lời hiển thị. Draft và biên lai thường để trống |
| `payload`    | JSON, hình dạng phụ thuộc `role`             |
| `created_at` | Epoch millisecond                            |
| `tx_id`      | Id khoản khi tin là `receipt` hoặc `deleted`. Draft để null |

Index: `msg_created` trên `created_at DESC`, `msg_tx` trên `tx_id`.

Biên lai tìm khoản bằng `tx_id`, không bằng `LIKE` trên JSON. `tx_id` được điền khi ghi tin và được lấp cho sổ cũ lúc mở, đọc `payload.txId`.

**`category`**

| Cột           | Ý nghĩa                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `id`          | Id cố định với danh mục seed (`food`, `drink`, …) hoặc UUID                |
| `name`        | Tên người dùng thấy. `tx.category` và `chip.category` trỏ vào đây bằng tên |
| `icon`        | Emoji                                                                      |
| `sort`        | Thứ tự seed                                                                |
| `is_hidden`   | `0` hoặc `1`. Ẩn không xoá dòng                                            |
| `usage_count` | Số khoản đang mang đúng tên này                                            |

**`chip`** — nút ghi nhanh trên composer. App chỉ đọc (`chips()`), không có API sửa.

| Cột        | Ý nghĩa                   |
| ---------- | ------------------------- |
| `id`       | UUID                      |
| `label`    | Nhãn, ví dụ `Trà sữa 35k` |
| `amount`   | VND, `> 0`                |
| `category` | Tên danh mục              |
| `sort`     | Thứ tự trên composer      |

Đổi tên danh mục (`saveCategory` thấy id hoặc tên đã có) cập nhật `tx.category` và `chip.category` trong cùng transaction, rồi mới đổi tên dòng `category`.

### Seed và số lần dùng

Mỗi lần mở sổ: `INSERT OR IGNORE` 18 danh mục trong `DEFAULT_CATEGORIES` (`lib/category-match.ts`). Danh mục người dùng đã sửa không bị ghi đè.

Chip mẫu chỉ khi bảng `chip` đang trống: trà sữa 35k, cơm trưa 55k, đổ xăng 70k, gửi xe 5k.

Sau seed, `usage_count` được đếm lại từ bảng `tx` theo đúng tên danh mục. Sổ lệch từ bản trước được kéo về số khoản thật.

`resetAllData` xoá `tx` và `msg`, rồi đặt `usage_count = 0`. Danh mục và chip giữ nguyên.

## Ngày

Mọi ngày sổ tính theo `Asia/Ho_Chi_Minh`, không theo múi giờ máy.

- `localDateIso` — hôm nay dạng `YYYY-MM-DD`.
- `normalizeIso` — nhận `2026-9-24` hoặc `24/9/2026`, trả `YYYY-MM-DD` hoặc `null`.
- `shiftIso` — cộng ngày qua mốc trưa `+07:00`.
- `monthKey` — bảy ký tự đầu, `YYYY-MM`.

`loadIslandData` lấy tháng hiện tại bằng cách lọc `date >= YYYY-MM-01` và `date <` ngày 01 của tháng sau. Màn sổ gọi hàm này rồi đưa số cho thanh đảo.

## Vòng đời một khoản

Draft chưa phải giao dịch. Chỉ `confirmDraftMessages` tạo dòng `tx` mới. Sửa khoản đã có đi qua `commitRevision` và không tạo id mới.

```text
user / assistant          lời người dùng và câu trả lời
        │
        ▼
draft                     payload DraftPayload, tx_id null
        │  confirmDraftMessages hoặc commitRevision
        ▼
receipt                   cùng dòng msg, role đổi, payload và tx_id có txId
        │  deleteRecorded
        ▼
deleted                   role đổi, payload thêm deletedAt, tx_id giữ nguyên
        │  hết giờ hoàn tác
        ▼
discardThread             xoá tin. Cả lượt hết thì chèn role cleared
```

`recentMessages()` không giới hạn số tin, trả cũ → mới. Có `limit` thì lấy mới nhất rồi đảo lại. Màn sổ tải cả hội thoại, nên xoá một ngày trong chat xoá được mọi khoản còn biên lai của ngày đó.

### Payload

`Draft` — số mô hình đề xuất:

- `amount`, `direction`, `category`, `note`, `date` (`YYYY-MM-DD`), `confidence`
- `revision` chỉ giữ khi đủ `txId`, `previousAmount`, `previousCategory`, `previousDate`
- `wantsRevision` bị parser xoá. Đó là cờ tạm trước khi `planRevisions` gắn khoản cũ

`DraftPayload` thêm `groupId` khi nhiều khoản đi cùng một lượt nói.

`ReceiptPayload` là draft cộng `txId`, và có thể có `groupId`, `deletedAt`.

`VoicePayload`: `{ kind: 'voice', uri, durationSec, mimeType? }` trên tin `role = user`.

Tin `assistant` có thể để `payload` là `{ intent }` với `record`, `query` hoặc `off_topic`.

Parser (`parseDraftPayload`, `parseReceiptPayload`, `parseVoicePayload`) trả `null` khi JSON hỏng hoặc thiếu trường bắt buộc. Số tiền phải `> 0`, hướng chỉ `chi` | `thu`, ngày phải qua `normalizeIso`.

### Ghi trong một transaction

`confirmDraftMessages`, từng draft:

1. Tạo `txId` mới.
2. `INSERT` vào `tx`. `created_at = Date.now() + index` để các khoản cùng lượt không trùng millisecond.
3. Đổi dòng `msg` thành `role = receipt`, ghi `payload` và `tx_id`.
4. `bumpCategoryUsage(category, +1)`.

`revertDraftMessages` xoá các `tx` đó, trừ usage, đưa tin về `draft` và xoá `tx_id`.

`commitRevision` sửa dòng `tx` đã có, cập nhật mọi biên lai cùng `tx_id`, rồi đổi tin draft thành biên lai trỏ cùng id. Đổi tên danh mục thì trừ usage tên cũ, cộng usage tên mới. `revertRevision` viết lại số cũ và đưa tin về draft.

`saveReceiptEdit` sửa `tx` và mọi biên lai cùng khoản.

`deleteRecorded` xoá `tx`, trừ usage, đổi các biên lai thành `deleted`. `restoreRecorded` tạo lại mỗi `txId` một lần rồi đưa tin về `receipt`. Trùng id thì chỉ cập nhật, không cộng usage thêm.

`discardThread` xoá các khoản và các tin được chỉ định. Có thể chèn một tin `cleared` trong cùng transaction.

Nút ghi nhanh không gọi Gemini. App tạo tin user, câu trả lời và draft từ số liệu có sẵn trên chip. Xác nhận draft đi cùng đường với khoản nói bằng chữ.

## Hỏi số đã ghi

Ý định `query` không nhận số từ Gemini. Mô hình chỉ trả `query.start`, `query.end` (ngày inclusive, `YYYY-MM-DD`) và `query.category` nếu câu nói nêu đúng một tên danh mục.

`normalizeQuery` bỏ khoảng ngày hỏng và dùng từ đầu tháng đến hôm nay. Danh mục không có trong sổ thì bỏ lọc. `txsBetween` đọc `tx`, `speakLedger` ghép câu tiếng Việt có số chi, số thu và số khoản.

Ý định còn lại là `record` và `off_topic`. App không lưu nợ, mục tiêu hay lương tháng.

## Sửa một khoản đã có

`revisionCandidates` lấy mọi khoản có `date` trong 120 ngày gần nhất, kể cả ngày sau hôm nay nếu đã có dòng. `planRevisions` chỉ gắn `revision.txId` khi câu nói là lời sửa, hoặc mô hình đặt `revise`, và trong khoảng ngày đó có khoản khớp. Ghi âm không có lời thoại sẵn, nên bước này dùng ghi chú trong draft.

Lời sửa mà khoảng ngày không có khoản khớp thì không tạo nháp. Ngày sau hôm nay cũng không tạo khoản mới. Câu ghi bù, ví dụ quên ghi một ngày đã qua, vẫn tạo nháp. Khoản cũ hơn 120 ngày không được gắn vào bản sửa; lời sửa ở đó không thành khoản mới.

## Danh mục

`categories()` sắp: đang hiện trước (khi không xin cả dòng ẩn), rồi `usage_count DESC`, `sort ASC`, `name` không phân biệt hoa thường.

`saveCategory`:

- Tên rỗng thì lỗi.
- Có `id` thì tìm theo id. Không có thì tìm theo tên không phân biệt hoa thường.
- Trùng thì cập nhật tên, icon, cờ ẩn, và đổi tên trên `tx` cùng `chip` nếu tên đổi.
- Không trùng thì chèn, `sort` = max + 1, `usage_count = 0`.

`hideCategory` đọc dòng hiện tại rồi gọi `saveCategory` với `hidden`.

`bumpCategoryUsage` cộng delta theo tên, kẹp dưới bằng `MAX(0, usage_count + delta)`. Hàm này nhận connection sẵn, gọi từ trong transaction của `tx`, không đi qua `runDb` lần nữa.

## Đọc cho giao diện

| Hàm                  | Trả về                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `recentMessages()`   | Cả hội thoại, cũ → mới. Có limit thì chỉ bấy nhiêu tin mới nhất       |
| `revisionCandidates` | Khoản trong 120 ngày, mới trước                                        |
| `txsBetween`         | Khoản có ngày nằm trong `[start, end]`                                 |
| `txsOnDate`          | Khoản của một ngày, mới trước                                          |
| `dayTotals`          | `spend`, `income`, `count` của một ngày, tính trong SQL                |
| `totalsOf`           | Cùng ba số, tính trên mảng đã tải                                      |
| `loadIslandData`     | Mọi `tx`, rồi lọc ngày đang xem và tháng của hôm nay                   |
| `receiptsForTx`      | Tin `receipt` có `tx_id` trùng khoản                                   |

Tổng trên thanh đảo lấy từ `tx`. Tổng trên mốc ngày trong chat cộng biên lai đang hiện, mỗi `txId` một lần.

## Ai gọi sổ

| Chỗ                               | Việc                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `app/so-chi-tieu.tsx`             | Đọc cả hội thoại, ghi tin, xác nhận, sửa, xoá, hoàn tác, reset       |
| `components/CategoryProvider.tsx` | Tải, lưu, ẩn danh mục. Đưa icon theo tên                             |
| `components/DynamicIsland.tsx`    | Hiện số mà màn sổ đã tải bằng `loadIslandData`                       |
| `components/QuickChips.tsx`       | Nhận `ChipRow` đã tải từ màn sổ                                      |
| `lib/gemini.ts`                   | Danh mục làm enum. Khoản 120 ngày để gắn bản sửa. Khoảng ngày để trả lời query |

`CategoryProvider` bọc toàn app trong `app/_layout.tsx`, cạnh `AuthProvider`. Auth không tham gia đường ghi sổ. Một máy là một file `so-chi-tieu.db`, không tách theo user.
