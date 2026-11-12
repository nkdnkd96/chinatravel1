CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    members TEXT DEFAULT 'Gia đình (4 người)',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS itinerary_items (
    id SERIAL PRIMARY KEY,
    trip_id INT REFERENCES trips(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL, -- 'flight', 'hotel', 'train', 'esim', 'ticket'
    title VARCHAR(255) NOT NULL,
    provider_or_code VARCHAR(150),  -- Mã PNR, Mã Booking, Số tàu, Nhà mạng
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP,
    location_from VARCHAR(255),
    location_to VARCHAR(255),
    assigned_to VARCHAR(150) DEFAULT 'Cả đoàn',
    cost NUMERIC(12, 0) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Confirmed',
    details JSONB DEFAULT '{}'::jsonb, -- Lưu Gate, Seat, Coach, Room, Data Plan...
    qr_image TEXT, -- Lưu Base64 ảnh QR eSIM / Vé điện tử
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dữ liệu mẫu khởi tạo sẵn
INSERT INTO trips (title, destination, start_date, end_date, members, notes)
VALUES ('Kỳ nghỉ Gia đình Đà Nẵng - Hội An', 'Đà Nẵng, Việt Nam', '2026-11-26', '2026-11-29', 'Bố, Mẹ, 2 Bé', 'Mang theo áo khoác mỏng và giấy khai sinh cho bé');

INSERT INTO itinerary_items (trip_id, item_type, title, provider_or_code, start_datetime, end_datetime, location_from, location_to, assigned_to, cost, status, details)
VALUES 
(1, 'flight', 'Vietnam Airlines VN163', 'PNR: K8X92M', '2026-11-26 08:30:00', '2026-11-26 09:50:00', 'HAN (T1 - Gate 5)', 'DAD (T1)', 'Cả gia đình', 6400000, 'Đã xuất vé', '{"seat": "14A, 14B, 14C, 14D", "baggage": "20kg/người"}'),
(1, 'esim', 'eSIM Du lịch 5G tốc độ cao', 'Viettel / Airalo', '2026-11-26 07:00:00', '2026-11-29 23:59:00', 'Việt Nam', '5GB/ngày (4 ngày)', 'Máy Bố & Mẹ', 250000, 'Đã cài đặt', '{"iccid": "898404829100293", "activation": "LPA:1$rsp.truphone.com$Q29kZQ=="}'),
(1, 'hotel', 'Novotel Danang Premier Han River', 'BOOK-994821', '2026-11-26 14:00:00', '2026-11-29 12:00:00', '36 Bạch Đằng, Hải Châu, Đà Nẵng', 'Phòng Family Suite', 'Cả gia đình', 7500000, 'Đã thanh toán', '{"breakfast": "Có ăn sáng Buffet", "hotline": "0236 3929 999"}'),
(1, 'ticket', 'Vé Cáp treo Sun World Bà Nà Hills', 'QR-BANA-772', '2026-11-27 08:30:00', '2026-11-27 16:30:00', 'Hòa Ninh, Hòa Vang, Đà Nẵng', 'Vé Cáp treo + Buffet Trưa', '2 Người lớn, 2 Trẻ em', 3200000, 'Sẵn sàng dùng', '{"slot": "Vào cổng tự do 08:00 - 17:00"}'),
(1, 'train', 'Tàu hỏa Di sản Huế - Đà Nẵng (HĐ2)', 'VNR-88310', '2026-11-28 07:45:00', '2026-11-28 10:35:00', 'Ga Đà Nẵng', 'Ga Huế', 'Cả gia đình', 720000, 'Đã xuất vé', '{"coach": "Toa 3 (Ghế mềm điều hòa)", "seat": "Ghế 11, 12, 13, 14"}');