# 订房会员资格与权益使用流程图

```mermaid
graph TB
    start([学生咨询订房]) --> booking[完成 NGN 订房]
    booking --> verify{订房资格是否可确认}
    verify -->|否| normal[按普通客户服务跟进]
    verify -->|是| match[匹配或创建网站账号]
    match --> issue{选择发放方式}
    issue -->|后台直接开通| grant[管理员开通当期订房会员]
    issue -->|激活码| code[生成一次性会员激活码]
    code --> redeem[学生登录后兑换激活码并填写生日]
    grant --> member[获得当期订房会员资格]
    redeem --> member
    member --> choose{是否已选择权益}
    choose -->|否| select[四选一选择权益]
    choose -->|是| existing[保留已选权益]
    select --> benefit{权益类型}
    existing --> benefit
    benefit -->|寄存| storage[提交寄存取件订单后自动绑定]
    benefit -->|接机| pickup[提交接机订单后自动绑定]
    benefit -->|搬家| moving[联系客服线下安排并人工登记]
    benefit -->|新生礼包| pack[联系客服领取并人工登记]
    storage --> reserved[权益绑定订单并进入已预约]
    pickup --> reserved
    moving --> manual[管理员记录人工权益]
    pack --> manual
    reserved --> service[服务完成或订单确认]
    manual --> service
    service --> used[管理员核销为已使用]
    used --> archive[归档订单、凭证和操作记录]
    normal --> end([结束])
    archive --> end

    classDef startEnd fill:#e7f5ff,stroke:#1971c2,color:#123;
    classDef eligibility fill:#fff4e6,stroke:#e67700,color:#123;
    classDef operation fill:#f8f9fa,stroke:#868e96,color:#123;
    classDef member fill:#d3f9d8,stroke:#2f9e44,color:#123;
    classDef risk fill:#ffe3e3,stroke:#c92a2a,color:#123;
    class start,end startEnd;
    class verify,issue,choose,benefit eligibility;
    class member,used member;
    class normal risk;
    class booking,match,grant,code,redeem,select,existing,storage,pickup,moving,pack,reserved,manual,service,archive operation;
```
