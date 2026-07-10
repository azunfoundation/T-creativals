<?php
declare(strict_types=1);
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model {
    protected $fillable = ['name','date','type','description'];
    protected function casts(): array { return ['date'=>'date']; }
}
