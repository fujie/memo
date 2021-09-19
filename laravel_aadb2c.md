# laravel + Azure AD B2C

## sailのインストール
```
% curl -s https://laravel.build/laravel-sail-app | bash
% cd laravel-sail-app && ./vendor/bin/sail up
```

## Socialiteのインストール
```
% ./vendor/bin/sail composer require laravel/socialite
% ./vendor/bin/sail composer require socialiteproviders/manager
```

## 必要パッケージ(firebase/php-jwt)のインストール
```
% ./vendor/bin/sail composer require firebase/php-jwt
```

## SocialiteにAzure AD B2Cのモジュールをコピーする
```
% mkdir ./vendor/socialiteproviders
% cp -r xxx/AzureADB2C ./vendor/socialiteproviders
```

## Azure AD B2C環境の設定
- config/services.php
```
'azureadb2c' => [
    'client_id' => env('AADB2C_ClientId'),
    'client_secret' => env('AADB2C_ClientSecret'),
    'redirect' => env('AADB2C_RedirectUri'),
    'domain' => env('AADB2C_Domain'),
    'policy' => env('AADB2C_Policy'),
    'cache_time' => env('AADB2C_CacheTime')
],
```

- .env
```
AADB2C_Domain=nfpoc
AADB2C_Policy=b2c_1_xxxx
AADB2C_RedirectUri=http://localhost/cb
AADB2C_ClientId=xxxx-xxxx-xxxx-xxxx
AADB2C_ClientSecret=your_secret
AADB2C_CacheTime=3600
```

## Composer.jsonにclassmapを登録する
- composer.json
```
"autoload": {
    "classmap": [
        "database",
        "vendor/socialiteproviders/AzureADB2C"
    ],
```

- 登録後、autoloadする
```
% ./vendor/bin/sail composer dump-autoload
```

## Socialiteの設定を行う
- config/app.php
```
'providers' => [
        \SocialiteProviders\Manager\ServiceProvider::class,
```

- App/Providers/EventServiceProvider.php
```
protected $listen = [
    \SocialiteProviders\Manager\SocialiteWasCalled::class => [
        'SocialiteProviders\\AzureADB2C\\AzureADB2CExtendSocialite@handle',
    ],
```

- LoginControllerの作成・設定
```
% ./vendor/bin/sail php artisan make:controller LoginController
```

以下の内容に置き換える
```php
<?php
namespace App\Http\Controllers;
use Illuminate\Http\Request;
use Auth;
use Socialite;
use App\Models\User;
class LoginController extends Controller
{
    public function redirectToProvider()
    {
        return Socialite::driver('azureadb2c')
            ->redirect();
    }
    public function handleProviderCallback()
    {
        $provided_user = Socialite::driver('azureadb2c')->user();
        $user = User::firstOrCreate([
            'name'  => $provided_user->name,
            'sub'   => $provided_user->id,
        ]);
        Auth::login($user);
        return view('welcome',[ 'auths' => Auth::user() ]);
    }
    // logout
    public function logout()
    {
        Auth::logout();
        return redirect(Socialite::driver('azureadb2c')->logout('http://localhost'));
    }
}
```

- routeの設定(Routes/web.php)
```php
Route::get('/home', [App\Http\Controllers\LoginController::class, 'redirectToProvider'])->name('login');
Route::get('/cb', [App\Http\Controllers\LoginController::class, 'handleProviderCallback'])->name('cb');
Route::get('/logout', [App\Http\Controllers\LoginController::class, 'logout'])->name('logout');
```

- route設定の確認
```
% ./vendor/bin/sail php artisan route:clear
% ./vendor/bin/sail php artisan route:list 
```	

- Modelの設定(App/Mode/User.php)

```php
protected $fillable = [
    'name',
    'sub'
];
```

- Viewの設定(Resources/views/welcome.blade.php)
```html
@auth
    <div><font color="#FFFFFF">{{ Auth::user()->name }}</font></div>
    <a href="{{ url('logout') }}" class="text-sm text-gray-700 dark:text-gray-500 underline">Log out</a>
```


## ユーザテーブルの作成
- database/migrations/2014_10_12_000000_create_users_table.php
```php
public function up()
{
    Schema::create('users', function (Blueprint $table) {
        $table->id();
        $table->string('name');
        $table->string('sub')->unique();
        $table->timestamps();
    });
}
```

```
% ./vendor/bin/sail artisan migrate
```
	
