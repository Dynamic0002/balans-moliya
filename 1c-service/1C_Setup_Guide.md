# 1C Dasturchisi Uchun Qo'llanma: HTTP-Servisni Sozlash va Nashr Qilish

Ushbu qo'llanma "MEAT CITY" 1C bazasida ta'sischilar dashboardi uchun HTTP-servisni yoqish bo'yicha bosqichma-bosqich yo'riqnomadir.

---

## 1. 1C Konfiguratorida HTTP-Servis Yaratish

1. **Konfiguratorni oching** va konfiguratsiyani o'zgartirish rejimiga o'ting (*Конфигурация -> Поддержка -> Настройка поддержки -> Включить возможность изменения* yoki *Расширение* (Extension) orqali qo'shing).
2. **Общие -> HTTP-сервисы** bo'limiga o'ting va yangi HTTP-servis qo'shing:
   - **Имя (Nomi):** `ExecutiveDashboard`
   - **Синоним:** `Ta'sischilar Dashboardi API`
   - **Корневой URL (Root URL):** `meatcity/v1`
3. **Шаблоны URL (URL shablonlari)** qo'shing:
   
| Шаблон URL | Метод | HTTP-метод | Имя обработчика |
|------------|-------|------------|-----------------|
| `/summary` | `GET` | `GET` | `GetExecutiveSummary` |
| `/pnl` | `GET` | `GET` | `GetPnLData` |
| `/cash` | `GET` | `GET` | `GetCashAndBank` |
| `/debts-stock` | `GET` | `GET` | `GetDebtsAndStock` |

4. HTTP-servisning **Модуль (BSL moduli)** oynasini oching va `HTTPService_ExecutiveDashboard.bsl` faylidagi barcha kodni joylashtiring.
5. Konfiguratsiyani saqlang va yangilang (**F7**).

---

## 2. Veb-Serverda (IIS / Apache) Qayta Nashr Qilish (Публикация)

Baza allaqachon veb-serverda nashr qilingan bo'lsa (`http://192.168.2.197/db45099115`):
1. Konfigurator menyusidan: **Администрирование -> Публикация на веб-сервере...** oynasini oching.
2. **HTTP-сервисы** yorlig'iga o'ting.
3. Yangi yaratilgan `ExecutiveDashboard` servisi qarshisiga **galochka (✓)** qo'yilganligini tekshiring.
4. **Опубликовать** tugmasini bosing.

---

## 3. Foydalanuvchi va Huquqlar (Роли и Права)

1. Dashboard uchun 1C da alohida texnik foydalanuvchi yarating:
   - **Имя:** `api_dashboard`
   - **Пароль:** *Xavfsiz parol tanlang*
   - **Аутентификация 1С:Предприятия:** Yoqilgan
   - **Показывать в списке выбора:** O'chirilgan (unchecked)
2. Unga `ПолныеПрава` yoki maxsus yaratilgan `Роль` (HTTP-servisdan foydalanish va schyotlar bo'yicha o'qish huquqi) biriktiring.

---

## 4. Tekshirish (Testlash)

Brauzer yoki Postman orqali quyidagi URL ni ochib ko'ring:
```
http://192.168.2.197/db45099115/hs/meatcity/v1/summary
```
*Autentifikatsiya oynasi chiqsa, `api_dashboard` va parolini kiriting.*

Agar sozlash to'g'ri bo'lsa, brauzerda quyidagi JSON javob qaytadi:
```json
{
  "company": "MEAT CITY",
  "generated_at": "2026-08-22T12:30:00",
  "cash_liquidity": {
    "bank_uzs": 4850000000,
    "cash_uzs": 920000000,
    "bank_usd": 85000,
    "total_liquid_uzs": 6858000000
  },
  "net_working_capital_uzs": 18228000000
}
```
