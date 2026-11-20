using Billing.Api.Services;
using Billing.Core;

namespace Billing.Api.Controllers;

public class InvoicesController
{
    private readonly InvoiceService service = new();
}
