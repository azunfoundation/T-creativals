<?php
declare(strict_types=1);
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class LeaveRequest extends Model {
    use SoftDeletes;
    protected $fillable = ['user_id','leave_type_id','start_date','end_date','days_count','reason','status','approved_by','approved_at','rejection_reason'];
    protected function casts(): array {
        return ['start_date'=>'date','end_date'=>'date','approved_at'=>'datetime','days_count'=>'decimal:1'];
    }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function leaveType(): BelongsTo { return $this->belongsTo(LeaveType::class); }
    public function approver(): BelongsTo { return $this->belongsTo(User::class, 'approved_by'); }
}
