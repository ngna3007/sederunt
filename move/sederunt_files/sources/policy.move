/// Seal policy for Sederunt channel files.
/// `seal_approve` succeeds only when the transaction sender is the address
/// stored on the shared Service object at publish time (the service wallet).
module sederunt_files::policy;

const ENotService: u64 = 1;

public struct Service has key {
    id: UID,
    service: address,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Service {
        id: object::new(ctx),
        service: ctx.sender(),
    });
}

public fun seal_approve(_id: vector<u8>, service: &Service, ctx: &TxContext) {
    assert!(ctx.sender() == service.service, ENotService);
}
