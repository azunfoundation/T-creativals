<?php
declare(strict_types=1);
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LeaveType extends Model {
    protected $fillable = ['name','code','days_allowed','is_paid','color','active'];
    protected function casts(): array {
        return ['is_paid'=>'boolean','active'=>'boolean','days_allowed'=>'integer'];
    }
    public function requests(): HasMany { return $this->hasMany(LeaveRequest::class); }
}
