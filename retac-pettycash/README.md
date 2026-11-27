# اعتماد البيتي كاش والشيكات - ريتاك أبوسمبل

إجراء اعتماد داخلي: الموظف يسجل الطلب، ثم مدير الحسابات، ثم المدير المالي، ثم يؤكد الموظف الصرف.
النظام غير مرتبط ببنك أو أموال.

التقنية: HTML وCSS وJavaScript بدون أي خطوة build، مع Firebase Authentication وCloud Firestore وHosting.

## هيكل الملفات

| الملف | الوظيفة |
|---|---|
| `public/index.html` | الصفحة وشاشة الدخول |
| `public/css/style.css` | التصميم |
| `public/images/` | صور لوحة RETAC المرجعية |
| `public/js/app.js` | كل منطق النظام |
| `public/js/firebase-config.js` | بيانات مشروعك وبنود الصرف |
| `firestore.rules` | الصلاحيات (الحماية الفعلية) |

## التشغيل لأول مرة

### 1) المتطلبات
ثبّت [Node.js](https://nodejs.org) (نسخة LTS) و Git و VS Code، ثم في Terminal داخل VS Code:

```
npm install -g firebase-tools
firebase login
```

لو PowerShell رفض تشغيل الأمر، استخدم Terminal من نوع Command Prompt.

### 2) إنشاء مشروع Firebase
من https://console.firebase.google.com :

1. **Add project** ثم اختر اسم المشروع. الخطة المجانية Spark كافية.
2. **Authentication** ثم Get started، وفعّل **Email/Password**.
3. **Firestore Database** ثم Create database، واختر **Production mode**، والموقع الأقرب (مثل `europe-west`). الموقع لا يتغير بعد الإنشاء.
4. **Project settings** ثم Your apps ثم أيقونة الويب `</>`، وسجّل التطبيق وانسخ بيانات `firebaseConfig`.

### 3) ربط الكود بالمشروع
- الصق القيم في `public/js/firebase-config.js`.
- في `.firebaserc` استبدل `PUT_PROJECT_ID` بمعرّف مشروعك (Project ID).

### 4) إنشاء المستخدمين (لكل شخص خطوتين)
**أ.** من Authentication ثم Users ثم **Add user**:
البريد يكون `اسم_المستخدم@retac-abs.local` مثل `ahmed@retac-abs.local`، مع كلمة سر قوية. انسخ **User UID**.

**ب.** من Firestore ثم **Start collection** باسم `users`. اجعل **Document ID هو الـ UID** نفسه، وأضف:

| Field | Type | Value |
|---|---|---|
| `name` | string | الاسم الظاهر |
| `role` | string | `emp` موظف، `acc` مدير حسابات، `fin` مدير مالي |
| `active` | boolean | `true` |

لإيقاف مستخدم اجعل `active` = `false`.

في شاشة الدخول يكتب المستخدم `ahmed` فقط.

> البريد هنا وهمي، فلا يمكن إرسال "نسيت كلمة السر". لتغييرها: احذف المستخدم من Authentication وأنشئه من جديد، ثم أنشئ مستند `users` بالـ UID الجديد.
> ملحوظة: طلباته الجارية القديمة تظل مرتبطة بالـ UID القديم ولا يستطيع إكمالها، فأنهِها أولًا.

### 5) التجربة على جهازك
```
firebase serve --only hosting
```
افتح http://localhost:5000 . هذا يعمل على قاعدة البيانات **الحقيقية**، بعد رفع القواعد في الخطوة التالية.

### 6) النشر
```
firebase deploy
```
سيظهر رابط النظام: `https://PROJECT_ID.web.app`

بعد أي تعديل أعد نفس الأمر.

## رفع الكود على GitHub
أنشئ مستودعًا **Private** فارغًا على GitHub، ثم:

```
git init
git add .
git commit -m "First version"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

`apiKey` الخاص بالويب ليس كلمة سر، والحماية تأتي من `firestore.rules`. لا ترفع أبدًا ملف Service Account.

## قواعد العمل المطبقة
- الصرف لا يتأكد إلا بعد اعتماد مدير الحسابات ثم المدير المالي.
- المدير المالي لا يقرأ الطلب إلا بعد موافقة مدير الحسابات.
- التعديل متاح فقط لصاحب الطلب بعد إرجاعه، ويبدأ الاعتماد من الأول.
- تأكيد الصرف لصاحب الطلب فقط.
- لا حذف للطلبات، وسجل الحركة يضاف إليه فقط.

## حدود يجب معرفتها
- المرفقات محفوظة داخل Firestore: الخطة المجانية بها 1 جيجابايت تخزين، أي حوالي بضعة آلاف من الصور المضغوطة. راقب الاستهلاك من Console.
- كل دخول يقرأ كل الطلبات. هذا مناسب لفرع واحد، ومع تراكم آلاف الطلبات يفضّل إضافة تحميل بالفترة.
- لا توجد نسخ احتياطية تلقائية في الخطة المجانية. صدّر تقرير CSV شهريًا.
