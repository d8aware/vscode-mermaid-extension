namespace Orders.Shop;

/// <summary>Anything with an identity.</summary>
public abstract class Entity
{
    public string Id { get; init; } = "";
}
